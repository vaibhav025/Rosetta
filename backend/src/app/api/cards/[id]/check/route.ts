import { requireUser } from "@/lib/auth";
import { aiConfigured } from "@/lib/ai/provider";
import { demoSampleFor } from "@/lib/cards";
import { isPitchCommit, PITCH, PITCH_FILES, PITCH_JUDGE } from "@/lib/demo/pitch";
import { diffText } from "@/lib/diff";
import { fetchChange, type RawFile } from "@/lib/github";
import type { ParsedLink } from "@/lib/github-url";
import { ApiError, ndjson, pause, preflight, route } from "@/lib/http";
import { prepare } from "@/lib/ingest";
import { canReview, canSeeCard, isLead, isTechnical, orgMembers } from "@/lib/org";
import { limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import type { StoredCard, Verification } from "@/lib/types";
import { impactText } from "@/lib/codegraph";
import { codeChecks, evidenceFor, judgeCached, RETRY_BELOW, type Judged } from "@/lib/verify";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

/** The pace of the on-screen steps. The checks themselves are real; this only makes them readable. */
const STEP_MS = 650;

/**
 * POST /api/cards/:id/check → NDJSON: { type: "step", key, state, detail }…, then
 * { type: "result", verification }. Re-runs the real checks against the
 * real diff, one visible step at a time: read the diff, match each box to
 * code, the plain-language rules, the invented-names rule, the second model.
 * The judge's answer is cached by content, so the same card always gets
 * the same score and repeat checks cost nothing.
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const users = await orgMembers(me.orgId);
  const card = await store.get<StoredCard>("cards", id);
  if (!card || !canSeeCard(me, card, users)) throw new ApiError("not_found");
  limit(`check:${me.id}`, 30, 60 * 60_000);

  // Like publicCard: the list of issues is for engineers and whoever can fix the card.
  const shown = (v: Verification): Verification => (canReview(me, card) || isTechnical(me.role) ? v : { ...v, issues: [] });

  return ndjson(async (emit) => {
    const step =async (key: string, run: () => Promise<{ detail: string; state?: "pass" | "warn" | "fail" }>) => {
      emit({ type: "step", key, state: "running" });
      const [out] = await Promise.all([run(), pause(STEP_MS)]);
      emit({ type: "step", key, state: out.state ?? "pass", detail: out.detail });
      return out;
    };

    // Hand-written samples have no diff to check against.
    if (demoSampleFor(card.repo, card.headSha) && card.explanation.verification) {
      await step("read", async () => ({ detail: "Built-in sample: written and checked by hand" }));
      return { type: "result", verification: shown(card.explanation.verification) };
    }

    const pitch = isPitchCommit(card.repo, card.headSha);
    let files: RawFile[] = [];
    let message = "";
    await step("read", async () => {
      if (pitch) {
        files = PITCH_FILES;
        message = PITCH.message;
      } else {
        const [owner, repo] = card.repo.split("/");
        const link: ParsedLink =
          card.ref.kind === "commit" ? { owner, repo, kind: "commit", sha: card.ref.sha } : { owner, repo, kind: "pull", number: card.ref.number };
        const prepared = prepare(await fetchChange(link, card.orgId));
        files = prepared.kept;
        message = prepared.change.message;
      }
      const lines = files.reduce((n, f) => n + f.additions + f.deletions, 0);
      return { detail: `Read ${files.length} file${files.length === 1 ? "" : "s"}, ${lines} changed lines` };
    });

    const e = card.explanation;
    const evidence = evidenceFor(e, files);
    await step("evidence", async () => {
      const boxes = e.flow.after.nodes.filter((n) => n.kind !== "start" && n.kind !== "end");
      const matched = boxes.filter((n) => Object.hasOwn(evidence, n.key)).length;
      return {
        detail: `Matched ${matched} of ${boxes.length} steps to lines in the diff`,
        state: boxes.length && matched / boxes.length < 0.3 ? "warn" : "pass",
      };
    });

    const context = impactText(card.impact);
    const issues = codeChecks(e, { message, files, context });
    if (boxesUnmatched(e, evidence, files)) issues.push("Most flowchart steps can't be matched to lines in the diff. Name the steps after what the code really does.");
    const wordIssues = issues.filter((i) => /technical words/.test(i));
    const nameIssues = issues.filter((i) => /don't appear in the diff/.test(i));
    await step("words", async () =>
      wordIssues.length
        ? { detail: `${wordIssues.length} version${wordIssues.length === 1 ? "" : "s"} for non-technical readers use code words`, state: "warn" }
        : { detail: "No code words in the manager, client or CMO versions" },
    );
    await step("names", async () =>
      nameIssues.length ? { detail: "Some code names aren't in the change", state: "warn" } : { detail: "Every code name it mentions is in the change" },
    );

    let judged: Judged | null = null;
    await step("judge", async () => {
      judged = pitch ? PITCH_JUDGE : aiConfigured() ? await judgeCached(e, { message, diff: diffText(files), orgId: card.orgId, context }) : null;
      return judged
        ? { detail: `Second model scored accuracy, completeness, flowchart and reader fit: ${(judged as Judged).score}/100` }
        : { detail: "Second model unavailable right now, so this uses the rules only", state: "warn" };
    });

    const j = judged as Judged | null;
    const penalty = Math.min(30, issues.length * 8);
    const score = Math.max(0, (j ? j.score : 84) - penalty);
    const verification: Verification = {
      score,
      confidence: score >= 85 ? "high" : score >= 70 ? "medium" : "low",
      checkedBy: j ? "ai" : "code",
      issues: [...issues, ...(j?.issues ?? [])].slice(0, 8),
      retried: e.verification?.retried ?? false,
      // No second model scored it: flag it rather than show the rules-only number as a real score.
      needsReview: score < RETRY_BELOW || !j,
      checkedAt: new Date().toISOString(),
    };
    // Clients see the result but don't change the stored score.
    if (isTechnical(me.role) || isLead(me.role) || canReview(me, card)) {
      // The card may have been reviewed or edited while this ran: re-read it and only
      // save the score if the text checked is still the text stored.
      const latest = await store.get<StoredCard>("cards", card.id);
      if (latest && sameText(latest.explanation, e)) {
        await store.set<StoredCard>("cards", card.id, { ...latest, explanation: { ...latest.explanation, verification, evidence } });
      }
    }
    return { type: "result", verification: shown(verification) };
  });
});

function boxesUnmatched(e: StoredCard["explanation"], evidence: Record<string, unknown>, files: RawFile[]) {
  const steps = e.flow.after.nodes.filter((n) => n.kind !== "start" && n.kind !== "end");
  return steps.length >= 3 && files.some((f) => f.patch) && steps.filter((n) => Object.hasOwn(evidence, n.key)).length / steps.length < 0.3;
}

/** The same words and flowchart (the score and evidence aside). */
function sameText(a: StoredCard["explanation"], b: StoredCard["explanation"]) {
  const text = (e: StoredCard["explanation"]) => JSON.stringify([e.title, e.levels, e.flow, e.walkthrough]);
  return text(a) === text(b);
}
