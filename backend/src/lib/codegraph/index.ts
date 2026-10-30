import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, gunzipSync, gzipSync } from "node:zlib";
import { demoSampleFor } from "../cards";
import { DEMO_REPO } from "../demo/samples";
import { fileAt, latestCommit, repoTarball, type Change } from "../github";
import { store } from "../store";
import type { Org } from "../types";
import { analyze, type Graph, type Impact } from "./impact";
import { goModule, isConfig, langOf, parseFile, tsconfigAliases, type FileNode } from "./parse";
import { TarReader } from "./tar";

export { impactText, type Impact } from "./impact";

/**
 * The repository map: for each watched repo, every source file's imports and
 * top-level definitions. Built once from the repository's tarball when the repo
 * is first watched (or its first commit arrives), then kept current commit by
 * commit, reading only the files each commit touched.
 *
 * Each explained commit is checked against the map as it stood just before
 * it, so a 5-line change shows the 40 files that rely on it (lib/codegraph/impact).
 *
 * Stored per workspace and repo, gzipped, split into chunks Firestore can hold.
 * The map holds names and paths only, never code.
 */

export type GraphStatus = "building" | "ready" | "failed" | "too_large";

export type GraphMeta = {
  id: string;
  orgId: string;
  repo: string;
  status: GraphStatus;
  /** The commit the map describes, and that commit's time (later commits only move it forward). */
  headSha?: string;
  headAt?: string;
  files: number;
  languages: Record<string, number>;
  /** Where the map is: `chunks` documents written under this version. */
  version?: string;
  chunks: number;
  /** More source files than MAX_FILES: the map holds the first ones only. */
  truncated?: boolean;
  builtAt?: string;
  updatedAt: string;
  /** A build in progress on some server holds this until it's done or the time passes. */
  buildingUntil?: string;
  error?: string;
};

type Chunk = { id: string; orgId: string; graphId: string; payload: { data: string } };

/** Limits that keep a build inside one serverless call and its memory. */
const MAX_TARBALL_BYTES = 80 * 1024 * 1024;
const MAX_FILE_BYTES = 300 * 1024;
const MAX_FILES = 8_000;
/** A commit touching more source files than this rebuilds the map instead of reading each one. */
const MAX_UPDATE_FILES = 40;
/** Base64 characters per stored chunk: well under Firestore's 1 MB per document. */
const CHUNK_CHARS = 600_000;
const BUILD_LEASE_MS = 5 * 60_000;
/** A failed build is tried again by the next commit only after this long. */
const RETRY_FAILED_MS = 60 * 60_000;
/** A map that a commit couldn't move forward is rebuilt from scratch when it's older than this. */
const REBUILD_AFTER_MS = 7 * 86_400_000;

export const graphId = (orgId: string, repo: string) => `${orgId}_${repo.toLowerCase().replace("/", "~")}`;
const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

/** Loaded maps by id, while their version is current. */
const cache = new Map<string, { version: string; graph: Graph }>();

export const graphMeta = (orgId: string, repo: string) => store.get<GraphMeta>("graphs", graphId(orgId, repo));

async function loadGraph(meta: GraphMeta): Promise<Graph | null> {
  if (meta.status !== "ready" || !meta.version) return null;
  const hit = cache.get(meta.id);
  if (hit?.version === meta.version) return hit.graph;
  const parts: string[] = [];
  for (let i = 0; i < meta.chunks; i++) {
    const c = await store.get<Chunk>("graph_chunks", `${meta.id}_${meta.version}_${i}`);
    if (!c) return null;
    parts.push(c.payload.data);
  }
  const graph = JSON.parse(gunzipSync(Buffer.from(parts.join(""), "base64")).toString("utf8")) as Graph;
  cache.set(meta.id, { version: meta.version, graph });
  if (cache.size > 50) cache.delete(cache.keys().next().value!);
  return graph;
}

const languagesOf = (graph: Graph) => {
  const out: Record<string, number> = {};
  for (const f of Object.values(graph.files)) out[f.lang] = (out[f.lang] ?? 0) + 1;
  return out;
};

/** Writes a new version of the map, then points the meta at it, then removes the old version. */
async function saveGraph(meta: GraphMeta, graph: Graph, patch: Partial<GraphMeta>) {
  const data = gzipSync(JSON.stringify(graph)).toString("base64");
  const version = Date.now().toString(36);
  const chunks = Math.max(1, Math.ceil(data.length / CHUNK_CHARS));
  for (let i = 0; i < chunks; i++) {
    const id = `${meta.id}_${version}_${i}`;
    await store.set<Chunk>("graph_chunks", id, { id, orgId: meta.orgId, graphId: meta.id, payload: { data: data.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS) } });
  }
  const next: GraphMeta = { ...meta, ...patch, status: "ready", version, chunks, files: Object.keys(graph.files).length, languages: languagesOf(graph), updatedAt: now() };
  delete next.buildingUntil;
  delete next.error;
  await store.set("graphs", meta.id, next);
  cache.set(meta.id, { version, graph });
  await removeChunks(meta.id, version);
  return next;
}

/** Removes a map's chunks, except those of `keep`. */
async function removeChunks(id: string, keep?: string) {
  for (const c of await store.list<Chunk>("graph_chunks", "graphId", id)) {
    if (!keep || !c.id.startsWith(`${id}_${keep}_`)) await store.remove("graph_chunks", c.id);
  }
}

/** Forgets a repo's map (the repo isn't watched any more). */
export async function dropGraph(orgId: string, repo: string) {
  const id = graphId(orgId, repo);
  cache.delete(id);
  await removeChunks(id);
  await store.remove("graphs", id);
}

/* ------------------------------------------------------------------ */
/* Building from the tarball                                           */
/* ------------------------------------------------------------------ */

class TooLarge extends Error {}

const emptyConfig = (): Graph["config"] => ({ aliases: {}, goModules: {} });

/** A config file's contribution to resolution, or nothing. */
function applyConfig(config: Graph["config"], path: string, text: string | null) {
  if (path.endsWith("go.mod")) {
    const m = text ? goModule(text) : undefined;
    if (m) config.goModules[path] = m;
    else delete config.goModules[path];
    return;
  }
  const aliases = text ? tsconfigAliases(path, text) : [];
  if (aliases.length) config.aliases[path] = aliases;
  else delete config.aliases[path];
}

/** Reads the repository at `ref` into a fresh map. */
async function readRepository(repo: string, ref: string, orgId: string): Promise<{ graph: Graph; truncated: boolean }> {
  const body = await repoTarball(repo, ref, orgId);
  const graph: Graph = { files: {}, config: emptyConfig() };
  let count = 0;
  let truncated = false;
  // GitHub puts everything under one "owner-repo-sha/" folder.
  const inner = (p: string) => p.slice(p.indexOf("/") + 1);
  const tar = new TarReader(
    (p, size) => {
      const path = inner(p);
      if (size > MAX_FILE_BYTES || !path) return false;
      if (isConfig(path)) return true;
      if (!langOf(path)) return false;
      if (count >= MAX_FILES) {
        truncated = true;
        return false;
      }
      count++;
      return true;
    },
    (p, data) => {
      const path = inner(p);
      const text = data.toString("utf8");
      if (isConfig(path)) applyConfig(graph.config, path, text);
      if (!langOf(path)) return;
      const node = parseFile(path, text);
      if (node) graph.files[path] = node;
    },
  );

  let bytes = 0;
  const reader = body.getReader();
  async function* compressed() {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        bytes += value.byteLength;
        if (bytes > MAX_TARBALL_BYTES) throw new TooLarge();
        yield Buffer.from(value);
      }
    } finally {
      // Stopped early (too big, an error): close the download too.
      await reader.cancel().catch(() => {});
    }
  }
  await pipeline(Readable.from(compressed()), createGunzip(), async (source: AsyncIterable<Buffer>) => {
    for await (const chunk of source) tar.push(chunk);
  });
  return { graph, truncated };
}

/** Builds in this process, one at a time per map, and shared by everyone waiting for it. */
const building = new Map<string, Promise<{ meta: GraphMeta; graph: Graph } | null>>();

/**
 * Builds (or rebuilds) a repo's map at a commit. Another server already
 * building it: null. Never throws; a failure is recorded on the meta.
 */
export function buildGraph(org: Pick<Org, "id">, repo: string, ref: { sha: string; at?: string }) {
  const id = graphId(org.id, repo);
  const running = building.get(id);
  if (running) return running;
  const run = (async () => {
    const prior = await store.get<GraphMeta>("graphs", id);
    if (prior?.status === "building" && Date.parse(prior.buildingUntil ?? "") > Date.now()) return null;
    const base: GraphMeta = prior ?? { id, orgId: org.id, repo: repo.toLowerCase(), status: "building", files: 0, languages: {}, chunks: 0, updatedAt: now() };
    await store.set<GraphMeta>("graphs", id, { ...base, status: "building", buildingUntil: new Date(Date.now() + BUILD_LEASE_MS).toISOString(), updatedAt: now() });
    try {
      const { graph, truncated } = await readRepository(repo, ref.sha, org.id);
      const meta = await saveGraph(base, graph, { headSha: ref.sha, headAt: ref.at, truncated, builtAt: now() });
      console.info(`[rosetta] repository map for ${repo}: ${meta.files} files${truncated ? " (truncated)" : ""}`);
      return { meta, graph };
    } catch (error) {
      const tooLarge = error instanceof TooLarge;
      const message = tooLarge ? `The repository is bigger than ${MAX_TARBALL_BYTES / 1024 / 1024} MB compressed.` : error instanceof Error ? error.message : String(error);
      console.warn(`[rosetta] repository map for ${repo} failed:`, message);
      const latest = (await store.get<GraphMeta>("graphs", id)) ?? base;
      // A map that existed stays usable; only a first build is marked failed.
      const failed: GraphMeta = { ...latest, status: latest.version ? "ready" : tooLarge ? "too_large" : "failed", error: message.slice(0, 300), updatedAt: now() };
      delete failed.buildingUntil;
      await store.set("graphs", id, failed);
      return null;
    }
  })().finally(() => building.delete(id));
  building.set(id, run);
  return run;
}

/** Builds a newly watched repo's map from its newest commit. For after() in the route that watches it. */
export async function buildLatest(org: Pick<Org, "id">, repo: string) {
  try {
    const head = await latestCommit(repo, org.id);
    await buildGraph(org, repo, { sha: head.sha, at: head.date });
  } catch (error) {
    console.warn(`[rosetta] couldn't start the repository map for ${repo}:`, error instanceof Error ? error.message : error);
  }
}

/* ------------------------------------------------------------------ */
/* Per change                                                          */
/* ------------------------------------------------------------------ */

const READ = new Set(["added", "modified", "changed", "copied", "renamed"]);

/** The files a commit touched, as they are after it (null: gone), or "rebuild" when there are too many to read. */
async function readChanged(org: Org, change: Change) {
  const nodes: Record<string, FileNode | null> = {};
  const configs: Record<string, string | null> = {};
  const wanted = change.files.filter((f) => langOf(f.filename) || isConfig(f.filename));
  if (wanted.length > MAX_UPDATE_FILES) return "rebuild" as const;
  for (const f of change.files) if (f.previous_filename) nodes[f.previous_filename] = null;
  await Promise.all(
    wanted.map(async (f) => {
      const text = READ.has(f.status) ? await fileAt(change.repo, f.filename, change.headSha, org.id) : null;
      if (isConfig(f.filename)) configs[f.filename] = text;
      if (langOf(f.filename)) nodes[f.filename] = text === null ? null : (parseFile(f.filename, text) ?? null);
    }),
  );
  return { nodes, configs };
}

const skipRepo = (repo: string, sha: string) => repo.toLowerCase() === DEMO_REPO.toLowerCase() || Boolean(demoSampleFor(repo, sha));

/**
 * What a change reaches in its repository, and the map moved forward past it.
 * Only for watched repos (where the map is kept); undefined when there's no map
 * yet and it couldn't be built, or anything goes wrong. Never throws: the
 * explanation goes ahead without it.
 */
export async function impactFor(org: Org, change: Change): Promise<Impact | undefined> {
  const repo = change.repo.toLowerCase();
  if (!org.repos.includes(repo) || skipRepo(repo, change.headSha)) return undefined;
  try {
    let meta = await graphMeta(org.id, repo);
    let graph = meta ? await loadGraph(meta) : null;
    if (!graph) {
      const failedRecently = meta && meta.status !== "ready" && meta.status !== "building" && Date.now() - Date.parse(meta.updatedAt) < RETRY_FAILED_MS;
      if (meta?.status === "too_large" || failedRecently) return undefined;
      // First commit seen: map the repository as it was just before it, so the change itself is what we measure.
      const built = await buildGraph(org, repo, change.parentSha ? { sha: change.parentSha } : { sha: change.headSha, at: change.committedAt });
      if (!built) return undefined;
      ({ meta, graph } = built);
    }
    if (!meta || !graph) return undefined;

    // Only commits move the map, and only forward: the next commit after the map's
    // (its parent is the map's commit), or a later one. An older commit (a retry,
    // a re-explain) is measured, not applied.
    const head = meta.headSha?.toLowerCase();
    const forward =
      change.ref.kind === "commit" &&
      head !== change.headSha.toLowerCase() &&
      (change.parentSha?.toLowerCase() === head || !meta.headAt || change.committedAt >= meta.headAt);
    const after = forward ? await readChanged(org, change) : undefined;
    const impact = analyze(graph, change.files, after && after !== "rebuild" ? after.nodes : {}, meta.headSha);

    if (!forward && Date.now() - Date.parse(meta.builtAt ?? meta.updatedAt) > REBUILD_AFTER_MS) {
      // Commits that arrived out of order can leave a map behind: start afresh from the newest commit now and then.
      await buildLatest(org, repo);
    } else if (after === "rebuild") {
      await buildGraph(org, repo, { sha: change.headSha, at: change.committedAt });
    } else if (after) {
      const next: Graph = { files: { ...graph.files }, config: structuredClone(graph.config) };
      for (const [path, node] of Object.entries(after.nodes)) {
        if (node) next.files[path] = node;
        else delete next.files[path];
      }
      for (const [path, text] of Object.entries(after.configs)) applyConfig(next.config, path, text);
      await saveGraph(meta, next, { headSha: change.headSha, headAt: change.committedAt });
    }
    return impact;
  } catch (error) {
    console.warn(`[rosetta] impact for ${repo}@${change.headSha.slice(0, 7)} skipped:`, error instanceof Error ? error.message : error);
    return undefined;
  }
}

/** The maps of a workspace's watched repos, for the GitHub panel. */
export async function graphsOf(org: Org) {
  const metas = await store.list<GraphMeta>("graphs", "orgId", org.id);
  return org.repos.map((repo) => {
    const m = metas.find((x) => x.repo === repo);
    return m
      ? { repo, status: m.status, files: m.files, languages: m.languages, headSha: m.headSha ?? null, builtAt: m.builtAt ?? null, updatedAt: m.updatedAt, truncated: Boolean(m.truncated), error: m.error ?? null }
      : { repo, status: "missing" as const, files: 0, languages: {}, headSha: null, builtAt: null, updatedAt: null, truncated: false, error: null };
  });
}
