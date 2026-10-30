import { defsIn, langOf, type Def, type FileNode } from "./parse";
import { Resolver, type Edge, type RepoConfig } from "./resolve";

/**
 * What a change reaches beyond its own diff. A 5-line change to a shared
 * function can matter to 40 other files; the diff alone never says so.
 *
 * From the repository map (every file's imports and top-level definitions):
 * 1. which functions and classes the diff touched, added or removed;
 * 2. the files that import exactly those (direct), or the whole file;
 * 3. the files that import those, a few steps out (indirect);
 * 4. files that still import something the change deleted (likely broken).
 */

export type Graph = { files: Record<string, FileNode>; config: RepoConfig };

export type Reach = "none" | "contained" | "moderate" | "wide";

export type Impact = {
  /** Per changed file: the definitions the diff touched, added and removed. */
  changed: { file: string; status: string; symbols: string[]; added?: string[]; removed?: string[] }[];
  /** Files that import what changed. `uses`: the changed names they import ([] = the whole file). */
  direct: { file: string; uses: string[] }[];
  /** Files further out (depth 2 or 3), and the file they reach it through. */
  indirect: { file: string; depth: number; via: string }[];
  /** Files left as they were that still import something this change removed or deleted. */
  broken: { file: string; names: string[]; from: string }[];
  /** Affected files grouped by part of the codebase, most first. */
  areas: { name: string; files: number }[];
  /** Affected screens, routes and handlers: where people would notice. */
  entryPoints: string[];
  /** Direct plus indirect files (at most MAX_REACHED; `capped` when there were more). */
  totalFiles: number;
  capped?: true;
  reach: Reach;
  /** [importer, imported] among the files above, for drawing the picture. */
  edges: [string, string][];
  /** How big the map was, and which commit it described. */
  mapFiles: number;
  mapSha?: string;
};

/** A change as the diff describes it (GitHub's files list). */
export type ChangedFile = { filename: string; status: string; patch?: string; previous_filename?: string };

const MAX_DEPTH = 3;
const MAX_REACHED = 200;
const MAX_DRAWN = 40;
/** A name standing for "lines above the first definition": imports, top-level setup. */
const TOP = "(top of file)";

/* ------------------------------------------------------------------ */
/* Reverse index, cached per graph object                              */
/* ------------------------------------------------------------------ */

export type Index = { importers: Map<string, Edge[]>; resolver: Resolver };

const indexes = new WeakMap<Graph, Index>();

/** Who imports each file. Built once per loaded graph. */
export function indexOf(graph: Graph): Index {
  const hit = indexes.get(graph);
  if (hit) return hit;
  const resolver = new Resolver(Object.keys(graph.files), graph.config);
  const importers = new Map<string, Edge[]>();
  for (const [from, node] of Object.entries(graph.files)) {
    for (const imp of node.imports) {
      for (const edge of resolver.resolve(from, node, imp)) {
        (importers.get(edge.to) ?? importers.set(edge.to, []).get(edge.to)!).push(edge);
      }
    }
  }
  const index = { importers, resolver };
  indexes.set(graph, index);
  return index;
}

/* ------------------------------------------------------------------ */
/* Reading the diff                                                    */
/* ------------------------------------------------------------------ */

/** Line numbers a patch touched, old and new, and the text of the removed and added lines. */
export function patchLines(patch: string) {
  const out = { old: [] as number[], new: [] as number[], minus: [] as string[], plus: [] as string[] };
  let a = 0;
  let b = 0;
  for (const line of patch.split("\n")) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (h) {
      a = Number(h[1]);
      b = Number(h[2]);
      continue;
    }
    if (line.startsWith("\\")) continue;
    if (line.startsWith("-")) {
      out.old.push(a++);
      out.minus.push(line.slice(1));
    } else if (line.startsWith("+")) {
      out.new.push(b++);
      out.plus.push(line.slice(1));
    } else {
      a++;
      b++;
    }
  }
  return out;
}

/** The definition a line belongs to: the last one starting at or before it. */
function defAt(defs: Def[], line: number) {
  let best: Def | undefined;
  for (const d of defs) if (d.line <= line && (!best || d.line >= best.line)) best = d;
  return best;
}

/** Names a change to these definitions affects, for matching imports: a default export also answers to "default". */
const namesOf = (defs: Def[]) => defs.flatMap((d) => (d.default ? [d.name, "default"] : [d.name]));

type Touched = {
  file: string;
  status: string;
  /** Names of changed definitions; `unknown` when we can't tell which (no patch, or not in the map). */
  symbols: Set<string>;
  unknown: boolean;
  added: string[];
  removed: string[];
  /** The whole file went away (deleted, or renamed). */
  gone: boolean;
};

function touched(f: ChangedFile, before: FileNode | undefined, after: FileNode | null | undefined): Touched {
  const gone = f.status === "removed";
  const t: Touched = { file: f.filename, status: f.status, symbols: new Set(), unknown: false, added: [], removed: [], gone };
  if (gone) {
    for (const n of namesOf(before?.defs ?? [])) t.symbols.add(n);
    t.unknown = true;
    return t;
  }
  const lang = before?.lang ?? after?.lang ?? langOf(f.filename);
  if (!f.patch || !lang) {
    t.unknown = true;
    return t;
  }
  const lines = patchLines(f.patch);
  const beforeDefs = before?.defs ?? [];
  for (const line of lines.old) {
    const d = defAt(beforeDefs, line);
    if (d) for (const n of namesOf([d])) t.symbols.add(n);
    else t.symbols.add(TOP);
  }
  if (after) {
    for (const line of lines.new) {
      const d = defAt(after.defs, line);
      if (d) for (const n of namesOf([d])) t.symbols.add(n);
      else t.symbols.add(TOP);
    }
  }
  // Definitions written or deleted in the diff itself.
  const minus = new Set(defsIn(lines.minus, lang).map((d) => d.name));
  const plus = new Set(defsIn(lines.plus, lang).map((d) => d.name));
  const stillThere = after ? new Set(after.defs.map((d) => d.name)) : plus;
  const existed = new Set(beforeDefs.map((d) => d.name));
  t.removed = [...minus].filter((n) => !stillThere.has(n) && n !== "default");
  t.added = [...plus].filter((n) => !existed.has(n) && !minus.has(n));
  for (const n of [...t.removed, ...t.added]) t.symbols.add(n);
  return t;
}

/* ------------------------------------------------------------------ */
/* Grouping                                                            */
/* ------------------------------------------------------------------ */

/** Folder names that say nothing about which part of the product a file belongs to. */
const GENERIC = new Set(["src", "lib", "source", "main", "java", "kotlin", "scala", "python", "internal", "pkg", "packages", "apps", "com", "org", "net", "io"]);

/** "frontend/src/components/feed.tsx" → "frontend/components". */
export function areaOf(path: string) {
  const dirs = path.split("/").slice(0, -1).filter((d) => !GENERIC.has(d.toLowerCase()));
  return dirs.slice(0, 2).join("/") || "(root)";
}

const ENTRY = /(^|\/)(pages|app|routes?|api|controllers?|handlers?|views?|screens?|endpoints?|cmd|commands?)\/|(^|\/)(page|route|layout|main|server|urls|views)\.\w+$/i;

/* ------------------------------------------------------------------ */
/* The analysis                                                        */
/* ------------------------------------------------------------------ */

/**
 * What `files` (a commit's or pull request's changes) reach in `graph`, the
 * map as it was before the change. `after` holds the changed files as they are
 * after it (null: deleted), when we read them; without it, definitions added
 * or removed are taken from the diff's own lines.
 */
export function analyze(graph: Graph, files: ChangedFile[], after: Record<string, FileNode | null> = {}, mapSha?: string): Impact {
  const { importers } = indexOf(graph);
  const changedSet = new Set(files.flatMap((f) => [f.filename, ...(f.previous_filename ? [f.previous_filename] : [])]));

  // A rename takes the old path's place: its importers point at the old name.
  const items: Touched[] = [];
  for (const f of files) {
    if (f.status === "renamed" && f.previous_filename) {
      const old = graph.files[f.previous_filename];
      items.push({ ...touched({ ...f, filename: f.previous_filename, status: "removed" }, old, null), status: "renamed" });
      continue;
    }
    items.push(touched(f, graph.files[f.filename], Object.hasOwn(after, f.filename) ? after[f.filename] : undefined));
  }

  const direct = new Map<string, Set<string>>();
  const broken = new Map<string, { names: Set<string>; from: string }>();
  for (const t of items) {
    const removed = new Set(t.removed);
    for (const e of importers.get(t.file) ?? []) {
      if (changedSet.has(e.from)) continue;
      // Gone or renamed: everyone importing it still points at a file that isn't there.
      if (t.gone || t.status === "renamed") {
        const b = broken.get(e.from) ?? { names: new Set<string>(), from: t.file };
        for (const n of e.names ?? ["(whole file)"]) b.names.add(n);
        broken.set(e.from, b);
      } else if (e.names) {
        for (const n of e.names.filter((x) => removed.has(x))) {
          const b = broken.get(e.from) ?? { names: new Set<string>(), from: t.file };
          b.names.add(n);
          broken.set(e.from, b);
        }
      }
      // Named imports reach it only when they name something that changed; a whole-file import always does.
      const real = [...t.symbols].filter((s) => s !== TOP);
      const uses = !e.names ? [] : t.unknown ? e.names : e.names.filter((n) => t.symbols.has(n));
      const reaches = !e.names ? t.unknown || t.symbols.size > 0 : uses.length > 0;
      if (!reaches) continue;
      const set = direct.get(e.from) ?? new Set<string>();
      for (const u of e.names ? uses : real) set.add(u);
      direct.set(e.from, set);
    }
  }

  // Further out: whoever imports a reached file, a few steps away, file by file.
  const indirect = new Map<string, { depth: number; via: string }>();
  let frontier = [...direct.keys()];
  let capped = false;
  for (let depth = 2; depth <= MAX_DEPTH && frontier.length; depth++) {
    const next: string[] = [];
    for (const file of frontier) {
      for (const e of importers.get(file) ?? []) {
        if (changedSet.has(e.from) || direct.has(e.from) || indirect.has(e.from)) continue;
        if (direct.size + indirect.size >= MAX_REACHED) {
          capped = true;
          break;
        }
        indirect.set(e.from, { depth, via: file });
        next.push(e.from);
      }
    }
    frontier = next;
  }

  const reached = [...direct.keys(), ...indirect.keys()];
  const areaCount = new Map<string, number>();
  for (const f of reached) areaCount.set(areaOf(f), (areaCount.get(areaOf(f)) ?? 0) + 1);
  const total = reached.length;

  // The picture: changed files first, then direct, then the nearest indirect ones.
  const drawn = new Set<string>([...items.map((t) => t.file), ...direct.keys()].slice(0, MAX_DRAWN));
  for (const [f] of [...indirect].sort((a, b) => a[1].depth - b[1].depth)) {
    if (drawn.size >= MAX_DRAWN) break;
    drawn.add(f);
  }
  const edges: [string, string][] = [];
  for (const to of drawn) for (const e of importers.get(to) ?? []) if (drawn.has(e.from)) edges.push([e.from, to]);

  return {
    changed: items.map((t) => ({
      file: t.file,
      status: t.status,
      symbols: [...t.symbols].filter((s) => s !== TOP && s !== "default").slice(0, 20),
      ...(t.added.length ? { added: t.added.slice(0, 20) } : {}),
      ...(t.removed.length ? { removed: t.removed.slice(0, 20) } : {}),
    })),
    direct: [...direct].map(([file, uses]) => ({ file, uses: [...uses].filter((u) => u !== "default").slice(0, 10) })).sort((a, b) => a.file.localeCompare(b.file)),
    indirect: [...indirect].map(([file, v]) => ({ file, ...v })).sort((a, b) => a.depth - b.depth || a.file.localeCompare(b.file)),
    broken: [...broken].map(([file, b]) => ({ file, names: [...b.names].slice(0, 10), from: b.from })),
    areas: [...areaCount].map(([name, n]) => ({ name, files: n })).sort((a, b) => b.files - a.files).slice(0, 8),
    entryPoints: reached.filter((f) => ENTRY.test(f)).slice(0, 20),
    totalFiles: total,
    ...(capped ? { capped: true as const } : {}),
    reach: total === 0 ? "none" : total <= 3 ? "contained" : total <= 15 ? "moderate" : "wide",
    edges: edges.slice(0, 120),
    mapFiles: Object.keys(graph.files).length,
    ...(mapSha ? { mapSha } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* For the model                                                       */
/* ------------------------------------------------------------------ */

const list = (xs: string[], max: number) => (xs.length > max ? `${xs.slice(0, max).join(", ")} and ${xs.length - max} more` : xs.join(", "));

/** The impact as a few lines of plain facts, for the explain prompt and the checker. Empty when there's nothing to say. */
export function impactText(impact: Impact | undefined) {
  if (!impact || (impact.totalFiles === 0 && !impact.broken.length)) return "";
  const lines: string[] = [];
  const touchedNames = impact.changed.filter((c) => c.symbols.length).map((c) => `${c.file} (${list(c.symbols, 6)})`);
  if (touchedNames.length) lines.push(`Changed definitions: ${list(touchedNames, 6)}.`);
  const removed = impact.changed.filter((c) => c.removed?.length).map((c) => `${list(c.removed!, 6)} in ${c.file}`);
  if (removed.length) lines.push(`Removed: ${list(removed, 4)}.`);
  lines.push(`Reach: ${impact.reach}. ${impact.direct.length} file${impact.direct.length === 1 ? "" : "s"} use the changed code directly, ${impact.totalFiles - impact.direct.length} more depend on those${impact.capped ? " (at least)" : ""}.`);
  if (impact.direct.length) {
    lines.push(`Used directly by: ${list(impact.direct.map((d) => (d.uses.length ? `${d.file} (${d.uses.join(", ")})` : d.file)), 12)}.`);
  }
  if (impact.areas.length) lines.push(`Parts of the codebase reached: ${impact.areas.map((a) => `${a.name} (${a.files})`).join(", ")}.`);
  if (impact.entryPoints.length) lines.push(`Screens, routes or handlers reached: ${list(impact.entryPoints, 8)}.`);
  if (impact.broken.length) {
    lines.push(`Still use something this change removed (not updated in this change): ${list(impact.broken.map((b) => `${b.file} (${b.names.join(", ")})`), 8)}.`);
  }
  return lines.join("\n").slice(0, 2_500);
}
