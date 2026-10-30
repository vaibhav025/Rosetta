import { env } from "./env";
import { appConfigured, installationToken } from "./github-app";
import type { ParsedLink } from "./github-url";
import { ApiError } from "./http";
import { store } from "./store";
import type { CardRef, Org, StoredCard } from "./types";

export type RawFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  blob_url: string;
  /** The old path, when the file was renamed. */
  previous_filename?: string;
};

export type Change = {
  repo: string;
  ref: CardRef;
  headSha: string;
  url: string;
  subject: string;
  message: string;
  author: { name: string; login: string };
  committedAt: string;
  files: RawFile[];
  /** How many parents a commit has: 2 or more is a merge. Missing for pull requests. */
  parents?: number;
  /** The commit before this one (its first parent), for the repository map. Missing for pull requests. */
  parentSha?: string;
};

class GitHubError extends Error {
  constructor(public status: number) {
    super(`GitHub responded ${status}`);
  }
}

/** Which workspace a request is for: its GitHub App installation, when it has one, reads its private repos. */
type Auth = { orgId?: string };

/** Installation ids by workspace, for a minute, so a sync doesn't read the org before every request. */
const installations = new Map<string, { id?: string; at: number }>();

/**
 * The token to read GitHub with for a workspace: its installation's when it
 * connected the GitHub App, otherwise the server's GITHUB_TOKEN (public repos,
 * as before). An installation token that can't be had falls back too.
 */
async function tokenFor(orgId?: string) {
  if (!orgId || !appConfigured()) return env.githubToken;
  let hit = installations.get(orgId);
  if (!hit || Date.now() - hit.at > 60_000) {
    const org = await store.get<Org>("orgs", orgId).catch(() => null);
    hit = { id: org?.githubInstallationId, at: Date.now() };
    installations.set(orgId, hit);
    if (installations.size > 2_000) installations.clear();
  }
  if (!hit.id) return env.githubToken;
  try {
    return await installationToken(hit.id);
  } catch (error) {
    console.warn(`[rosetta] no installation token for ${orgId}:`, error instanceof Error ? error.message : error);
    return env.githubToken;
  }
}

/** Forgets the remembered installation, after connecting or disconnecting. */
export const forgetInstallation = (orgId: string) => installations.delete(orgId);

async function request(path: string, init?: RequestInit, auth: Auth = {}): Promise<Response> {
  const token = await tokenFor(auth.orgId);
  let res: Response;
  try {
    res = await fetch(`${env.githubApiUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "rosetta-devlympics",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
      signal: init?.signal ?? AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError("network");
  }
  if (!res.ok) throw new GitHubError(res.status);
  return res;
}

/** The repo is gone, renamed or out of reach for good: listing it again won't help. */
export const repoGone = (error: unknown) => error instanceof GitHubError && [404, 410, 451].includes(error.status);

async function gh<T>(path: string, init?: RequestInit, auth?: Auth): Promise<T> {
  return (await request(path, init, auth)).json() as Promise<T>;
}

/** The number of the last page, from GitHub's Link header (1 when there's only one). */
const lastPage = (res: Response) => Number(/[?&]page=(\d+)[^>]*>; rel="last"/.exec(res.headers.get("link") ?? "")?.[1] ?? 1);

/** A missing commit in a visible repo is "not found"; an invisible repo is private. */
async function explainMissing(owner: string, repo: string, auth?: Auth): Promise<never> {
  try {
    await gh(`/repos/${owner}/${repo}`, undefined, auth);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) throw new ApiError("private");
    throw new ApiError("unavailable");
  }
  throw new ApiError("not_found");
}

function mapError(error: unknown, link: ParsedLink, auth?: Auth): Promise<never> {
  if (error instanceof GitHubError) {
    if (error.status === 404 || error.status === 422) return explainMissing(link.owner, link.repo, auth);
    if (error.status === 401 || error.status === 403 || error.status === 429) {
      console.warn(
        `[rosetta] GitHub refused the request (${error.status}).${env.githubToken ? "" : " Set GITHUB_TOKEN: the anonymous limit is 60 requests an hour."}`,
      );
      throw new ApiError("unavailable");
    }
  }
  throw error;
}

type CommitResponse = {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } };
  author: { login: string } | null;
  files?: RawFile[];
  parents?: { sha: string }[];
};

type PullResponse = {
  title: string;
  body: string | null;
  html_url: string;
  created_at: string;
  merged_at: string | null;
  user: { login: string };
  head: { sha: string };
};

/**
 * Commit or PR metadata and changed files (FR-1.3). Pass the workspace so its
 * GitHub App installation can read private repos.
 */
export async function fetchChange(link: ParsedLink, orgId?: string): Promise<Change> {
  const repo = `${link.owner}/${link.repo}`;
  const auth: Auth = { orgId };
  try {
    if (link.kind === "commit") {
      const c = await gh<CommitResponse>(`/repos/${repo}/commits/${link.sha}`, undefined, auth);
      return {
        repo,
        ref: { kind: "commit", sha: c.sha },
        headSha: c.sha,
        url: c.html_url,
        subject: c.commit.message.split("\n")[0],
        message: c.commit.message,
        author: { name: c.commit.author.name, login: c.author?.login ?? "" },
        committedAt: c.commit.author.date,
        files: c.files ?? [],
        parents: c.parents?.length,
        ...(c.parents?.[0]?.sha ? { parentSha: c.parents[0].sha } : {}),
      };
    }

    const [pr, files] = await Promise.all([
      gh<PullResponse>(`/repos/${repo}/pulls/${link.number}`, undefined, auth),
      gh<RawFile[]>(`/repos/${repo}/pulls/${link.number}/files?per_page=100`, undefined, auth),
    ]);
    const profile = await gh<{ name: string | null }>(`/users/${pr.user.login}`, undefined, auth).catch(() => null);
    return {
      repo,
      ref: { kind: "pull", number: link.number },
      headSha: pr.head.sha,
      url: pr.html_url,
      subject: pr.title,
      message: `${pr.title}\n\n${pr.body ?? ""}`.trim(),
      author: { name: profile?.name || pr.user.login, login: pr.user.login },
      committedAt: pr.merged_at ?? pr.created_at,
      files,
    };
  } catch (error) {
    return mapError(error, link, auth);
  }
}

/* ------------------------------------------------------------------ */
/* Whole repositories, for the repository map (lib/codegraph)          */
/* ------------------------------------------------------------------ */

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

/**
 * The repository at a commit, as a gzipped tar stream. GitHub redirects to
 * codeload with a short-lived token of its own, so private repos work too.
 */
export async function repoTarball(repo: string, ref: string, orgId?: string, timeoutMs = 120_000) {
  const res = await request(`/repos/${repo}/tarball/${encodeURIComponent(ref)}`, { signal: AbortSignal.timeout(timeoutMs) }, { orgId });
  if (!res.body) throw new ApiError("unavailable");
  return res.body;
}

/** One file's text at a commit, or null when it isn't there (deleted, or never existed). */
export async function fileAt(repo: string, path: string, ref: string, orgId?: string): Promise<string | null> {
  try {
    const res = await request(`/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, { headers: { Accept: "application/vnd.github.raw+json" } }, { orgId });
    return await res.text();
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
}

/** The newest commit on a branch (the default one when `branch` is missing). */
export async function latestCommit(repo: string, orgId?: string, branch?: string) {
  const [c] = await gh<{ sha: string; commit: { committer: { date: string } | null; author: { date: string } } }[]>(
    `/repos/${repo}/commits?per_page=1${branch ? `&sha=${encodeURIComponent(branch)}` : ""}`,
    undefined,
    { orgId },
  );
  if (!c) throw new ApiError("not_found");
  return { sha: c.sha, date: c.commit.committer?.date ?? c.commit.author.date };
}

/** Short-lived memory cache: Ask Why needs the diff, but diffs are never stored. */
const diffCache = new Map<string, { at: number; files: RawFile[] }>();

export async function filesFor(card: StoredCard): Promise<RawFile[]> {
  const hit = diffCache.get(card.id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.files;
  const [owner, repo] = card.repo.split("/");
  const link: ParsedLink =
    card.ref.kind === "commit"
      ? { owner, repo, kind: "commit", sha: card.ref.sha }
      : { owner, repo, kind: "pull", number: card.ref.number };
  const { files } = await fetchChange(link, card.orgId);
  diffCache.set(card.id, { at: Date.now(), files });
  return files;
}

type GhComment = {
  id: number;
  body: string;
  html_url: string;
  created_at: string;
  updated_at?: string;
  user: { login: string } | null;
  commit_id?: string;
};

/** Pages read per listing; past this a listing reports itself incomplete. */
const MAX_PAGES = 5;
const PER_PAGE = 100;

/**
 * Commits by one GitHub user in one repo since a date (newest first), with
 * their committer dates. `complete` is false when there were more than we read;
 * then `resumeAt` is the oldest date read, and anything older is given up on, so
 * a very busy author can't hold sync back for ever.
 */
export async function listAuthorCommits(repo: string, login: string, sinceIso: string, orgId?: string) {
  const commits: { sha: string; date: string }[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await gh<{ sha: string; commit: { committer: { date: string } | null; author: { date: string } } }[]>(
      `/repos/${repo}/commits?author=${encodeURIComponent(login)}&since=${encodeURIComponent(sinceIso)}&per_page=${PER_PAGE}&page=${page}`,
      undefined,
      { orgId },
    );
    commits.push(...batch.map((c) => ({ sha: c.sha, date: c.commit.committer?.date ?? c.commit.author.date })));
    if (batch.length < PER_PAGE) return { commits, complete: true as boolean, resumeAt: undefined as string | undefined };
  }
  return { commits, complete: false, resumeAt: commits.at(-1)?.date };
}

/**
 * Commit comments and PR/issue comments in a repo since a date. Errors are
 * thrown, not swallowed, so sync knows not to move past what it couldn't read.
 * When there are more than we read, `resumeAt` says where the next sync picks up.
 */
export async function listRepoComments(repo: string, sinceIso: string, orgId?: string) {
  const auth: Auth = { orgId };
  const since = Date.parse(sinceIso);
  const isNew = (c: GhComment) => Date.parse(c.created_at) > since;
  let complete = true;
  let resumeAt: string | undefined;
  const resume = (when: string | undefined) => {
    if (when && (!resumeAt || Date.parse(when) < Date.parse(resumeAt))) resumeAt = when;
  };

  // Commit comments come oldest first with no date filter, so read from the last page back.
  const first = await request(`/repos/${repo}/comments?per_page=${PER_PAGE}`, undefined, auth);
  const last = lastPage(first);
  const commitComments: GhComment[] = [];
  for (let page = last, read = 0; page >= 1; page--, read++) {
    if (read === MAX_PAGES) {
      // Older commit comments than these are given up on.
      complete = false;
      resume(commitComments.at(0)?.created_at);
      break;
    }
    const batch = page === 1 ? ((await first.json()) as GhComment[]) : await gh<GhComment[]>(`/repos/${repo}/comments?per_page=${PER_PAGE}&page=${page}`, undefined, auth);
    commitComments.unshift(...batch);
    if (batch.length && !isNew(batch[0])) break;
  }

  // Issue comments filter by `since` (last update), least recently updated first,
  // so the next sync carries on from the last one read.
  const issueComments: GhComment[] = [];
  for (let page = 1; ; page++) {
    if (page > MAX_PAGES) {
      complete = false;
      resume(issueComments.at(-1)?.updated_at);
      break;
    }
    const batch = await gh<GhComment[]>(
      `/repos/${repo}/issues/comments?since=${encodeURIComponent(sinceIso)}&sort=updated&direction=asc&per_page=${PER_PAGE}&page=${page}`,
      undefined,
      auth,
    );
    issueComments.push(...batch);
    if (batch.length < PER_PAGE) break;
  }

  const comments = [...commitComments, ...issueComments]
    .filter((c) => isNew(c) && c.user)
    .map((c) => ({
      id: c.id,
      body: c.body,
      url: c.html_url,
      createdAt: c.created_at,
      login: c.user!.login,
      commitSha: c.commit_id,
    }));
  return { comments, complete, resumeAt };
}
