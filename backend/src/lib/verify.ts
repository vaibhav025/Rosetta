import { createHash } from "node:crypto";
import { judgeExplanation } from "./ai/tasks";
import type { RawFile } from "./github";
import type { LevelKey } from "./levels";
import { store } from "./store";
import type { Evidence, Explanation, FlowGraph, Verification } from "./types";

/**
 * Credibility: every generated explanation is checked against the real diff
 * before anyone reads it. Plain code checks always run; a second model scores
 * it when one is available. Below the bar, it's rewritten once with the
 * problems as feedback, and still-low ones are flagged for the engineer.
 */

export const RETRY_BELOW = 75;

const NON_TECHNICAL: LevelKey[] = ["manager", "client", "cmo"];
const TECHNICAL: LevelKey[] = ["engineer", "senior", "intern"];

/** Words that mean code, wherever they appear. */
const CODE_WORDS = /\b(api|apis|endpoint|endpoints|regex|json|config|env|null|undefined|boolean|async|await|sql|http|https|localhost|stack ?trace|variable|function|middleware|schema|payload)\b/i;
/** Things shaped like code: camelCase, snake_case, calls(), paths, files. */
const CODE_SHAPES = [
  /\b[a-z]+[A-Z][A-Za-z0-9]*\b/, // camelCase
  /\b[A-Za-z]+_[A-Za-z0-9_]+\b/, // snake_case
  /\b[\w.]+\(\)/, // call()
  /\b[\w-]+\.(?:js|jsx|ts|tsx|py|go|rb|java|json|ya?ml|env|css|html|sql|md)\b/i, // file.ext
  /\b\w+\[\d*\]/, // servers[0]
];

const identifiersIn = (s: string) =>
  [
    ...new Set(
      [...s.matchAll(/\b([a-z]+[A-Z][A-Za-z0-9]*|[A-Za-z]+_[A-Za-z0-9_]+|[A-Za-z_$][\w$]*(?=\(\)))/g)].map((m) => m[1]),
    ),
  ];

function textsOf(e: Explanation, level: LevelKey) {
  const l = e.levels[level];
  return [l.summary, l.analogy, l.impact, ...Object.values(l.labels), l.walkthrough?.title ?? "", ...(l.walkthrough?.steps ?? [])].filter(Boolean);
}

/** Problems a reviewer can confirm by reading the code, no model needed. */
export function codeChecks(e: Explanation, input: { message: string; files: RawFile[]; context?: string }) {
  const issues: string[] = [];

  // 1. Code words in text for people who don't read code.
  for (const level of NON_TECHNICAL) {
    const bad = new Set<string>();
    for (const t of textsOf(e, level)) {
      const word = t.match(CODE_WORDS)?.[0];
      if (word) bad.add(word);
      for (const shape of CODE_SHAPES) {
        const hit = t.match(shape)?.[0];
        if (hit) bad.add(hit);
      }
    }
    if (bad.size) issues.push(`The ${level === "cmo" ? "CMO" : level} version uses technical words: ${[...bad].slice(0, 4).join(", ")}. Rewrite them in plain words.`);
  }

  // 2. Code names in the technical text that aren't in the change at all.
  const haystack = `${input.message}\n${input.files.map((f) => `${f.filename}\n${f.patch ?? ""}`).join("\n")}`.toLowerCase();
  const patchesShown = input.files.some((f) => f.patch);
  if (patchesShown) {
    const invented = new Set<string>();
    for (const level of TECHNICAL) {
      for (const t of textsOf(e, level)) for (const id of identifiersIn(t)) if (!haystack.includes(id.toLowerCase())) invented.add(id);
    }
    if (invented.size) issues.push(`Names that don't appear in the diff: ${[...invented].slice(0, 5).join(", ")}. Only name code that is really in the change.`);
  }

  // 3. Before and after drawn the same.
  if (e.flow.before && sameShape(e.flow.before, e.flow.after)) issues.push("The before and after flowcharts are the same. Show what changed.");

  return issues;
}

const sameShape = (a: FlowGraph, b: FlowGraph) =>
  JSON.stringify(a.nodes.map((n) => n.key).sort()) === JSON.stringify(b.nodes.map((n) => n.key).sort());

/* ------------------------------------------------------------------ */
/* Evidence: the diff lines behind each flowchart step                 */
/* ------------------------------------------------------------------ */

type DiffLine = { kind: "+" | "-" | " "; text: string; line: number };

function parsePatch(patch: string): DiffLine[][] {
  const hunks: DiffLine[][] = [];
  let current: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const raw of patch.split("\n")) {
    const header = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (header) {
      if (current.length) hunks.push(current);
      current = [];
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      continue;
    }
    const kind = raw[0] === "+" ? "+" : raw[0] === "-" ? "-" : " ";
    current.push({ kind, text: raw.slice(1), line: kind === "-" ? oldLine : newLine });
    if (kind !== "+") oldLine++;
    if (kind !== "-") newLine++;
  }
  if (current.length) hunks.push(current);
  return hunks;
}

const STOP = new Set("the a an and or of to in on for with from into is are be by at as it its this that then else when each every new old now not no one two three step steps".split(" "));

/** The words worth searching the diff for: code names first, then plain words. */
function termsFor(label: string, key: string) {
  const ids = identifiersIn(label).map((t) => t.toLowerCase());
  const words = `${label} ${key.replace(/_/g, " ")}`
    .toLowerCase()
    .split(/[^a-z0-9$]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
  return { ids, words: [...new Set(words)] };
}

/** Finds, for each node, the few diff lines that best support it. */
export function evidenceFor(e: Explanation, files: RawFile[]): Record<string, Evidence> {
  const parsed = files.filter((f) => f.patch).map((f) => ({ file: f, hunks: parsePatch(f.patch!) }));
  if (!parsed.length) return {};
  const before = new Set(e.flow.before?.nodes.map((n) => n.key) ?? []);
  const after = new Set(e.flow.after.nodes.map((n) => n.key));
  const out: Record<string, Evidence> = {};

  for (const node of [...e.flow.after.nodes, ...(e.flow.before?.nodes ?? [])]) {
    if (out[node.key]) continue;
    const label = e.levels.engineer.labels[node.key] ?? node.key;
    const { ids, words } = termsFor(label, node.key);
    if (!ids.length && !words.length) continue;
    // Steps only in "before" are best shown by removed lines; new ones by added lines.
    const prefer = before.has(node.key) && !after.has(node.key) ? "-" : "+";

    let best: { score: number; file: RawFile; hunk: DiffLine[]; at: number } | null = null;
    for (const { file, hunks } of parsed) {
      const path = file.filename.toLowerCase();
      // A step describes the code, so tests only win when nothing else matches.
      const testFile = /(^|\/)(tests?|__tests__|spec)\/|[._-](test|spec)\.|^tests?\.[a-z]+$/.test(path);
      for (const hunk of hunks) {
        hunk.forEach((l, at) => {
          const text = l.text.toLowerCase();
          if (!text.trim()) return;
          let score = 0;
          for (const id of ids) if (text.includes(id)) score += 4;
          for (const w of words) if (text.includes(w)) score += 1;
          if (score === 0) return;
          if (l.kind === prefer) score += 1.5;
          else if (l.kind !== " ") score += 0.5;
          if (ids.some((id) => path.includes(id)) || words.some((w) => path.includes(w))) score += 0.5;
          if (testFile) score -= 2;
          if (!best || score > best.score) best = { score, file, hunk, at };
        });
      }
    }
    // One plain word in an unchanged line isn't evidence.
    const found = best as { score: number; file: RawFile; hunk: DiffLine[]; at: number } | null;
    if (!found || found.score < 2.5) continue;
    const from = Math.max(0, found.at - 2);
    const lines = found.hunk.slice(from, from + 6);
    const line = found.hunk[found.at].line;
    out[node.key] = {
      file: found.file.filename,
      url: found.hunk[found.at].kind === "-" ? undefined : `${found.file.blob_url}#L${line}`,
      line,
      lines: lines.map(({ kind, text }) => ({ kind, text: text.slice(0, 160) })),
    };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

const confidenceOf = (score: number): Verification["confidence"] => (score >= 85 ? "high" : score >= 70 ? "medium" : "low");

export type Judged = { score: number; issues: string[] };

/**
 * Low scores need an engineer's read, and so does anything no second model
 * scored: the rules alone can't vouch for it, so its number isn't a real score.
 */
export const needsReview = (v: Pick<Verification, "score" | "checkedBy">) => v.checkedBy === "code" || v.score < RETRY_BELOW;

/** The same explanation of the same diff always gets the same score, and costs one model call ever. */
export async function judgeCached(e: Explanation, input: { message: string; diff: string; orgId?: string; context?: string }): Promise<Judged | null> {
  const { verification: _v, evidence: _e, ...content } = e;
  const id = createHash("sha256").update(JSON.stringify([content, input.message, input.diff, ...(input.context ? [input.context] : [])])).digest("hex").slice(0, 32);
  const hit = await store.get<Judged>("checks", id).catch(() => null);
  if (hit) return hit;
  try {
    const judged = await judgeExplanation({ message: input.message, diff: input.diff, explanation: e, orgId: input.orgId, context: input.context });
    await store.set("checks", id, judged).catch(() => {});
    return judged;
  } catch {
    // No judge today: the code checks still stand.
    return null;
  }
}

export async function verify(
  e: Explanation,
  input: { message: string; diff: string; files: RawFile[]; orgId?: string; context?: string },
  opts: { useAi: boolean },
): Promise<Omit<Verification, "retried" | "needsReview">> {
  const code = codeChecks(e, input);
  const evidence = evidenceFor(e, input.files);
  const steps = e.flow.after.nodes.filter((n) => n.kind !== "start" && n.kind !== "end");
  const backed = steps.filter((n) => evidence[n.key]).length;
  if (steps.length >= 3 && input.files.some((f) => f.patch) && backed / steps.length < 0.3) {
    code.push("Most flowchart steps can't be matched to lines in the diff. Name the steps after what the code really does.");
  }
  const penalty = Math.min(30, code.length * 8);

  const judged = opts.useAi ? await judgeCached(e, input) : null;
  // Without a second model, code checks alone can't vouch for high confidence,
  // and the result is marked unscored (checkedBy "code") so it's flagged for review.
  const score = judged ? Math.max(0, judged.score - penalty) : Math.max(0, 84 - penalty);
  return {
    score,
    confidence: confidenceOf(score),
    checkedBy: judged ? "ai" : "code",
    issues: [...code, ...(judged?.issues ?? [])].slice(0, 8),
    checkedAt: new Date().toISOString(),
  };
}
