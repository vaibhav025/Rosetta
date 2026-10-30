import { after } from "next/server";
import { buildLatest, dropGraph } from "@/lib/codegraph";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { GitHubAppError, listInstallationRepos } from "@/lib/github-app";
import { ApiError, json, preflight, route } from "@/lib/http";
import { isRepoName } from "@/lib/github-url";
import { requireOrg } from "@/lib/org";
import { store } from "@/lib/store";
import type { Org } from "@/lib/types";

export const dynamic = "force-dynamic";
// Mapping a newly watched repository runs after the answer, and can take a minute.
export const maxDuration = 300;
export const OPTIONS = preflight;

const repoName = z
  .string()
  .trim()
  .transform((r) => r.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$|\/$/g, ""))
  .refine((r) => isRepoName(r), "Use owner/repo, e.g. code-crunchers/rosetta-demo.");

/** A git branch name, roughly: no spaces or the characters git forbids. */
const branchName = z
  .string()
  .trim()
  .regex(/^(?!\/|.*\/\/|.*\.\.)[^\s~^:?*[\\]{1,100}(?<![/.])$/, "That isn't a branch name.");

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  repos: z.array(repoName).max(20).optional(),
  /** Branches to explain per repo; an empty list means the default branch only. */
  branches: z.record(repoName, z.array(branchName).max(10)).optional(),
});

/**
 * PATCH /api/org { name?, repos?, branches? }: the owner names the workspace,
 * chooses which repos Rosetta watches and, per repo, which branches (default:
 * the repo's default branch). The list is workspace-wide, so no single manager
 * may replace it. With the GitHub App connected, only repos it can read are allowed.
 */
export const PATCH = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  if (org.ownerId !== me.id) throw new ApiError("forbidden", "Only the workspace owner can change workspace settings.");
  const patch = patchSchema.parse(await req.json().catch(() => ({})));
  const repos = patch.repos ? [...new Set(patch.repos.map((r) => r.toLowerCase()))] : org.repos;

  if (patch.repos && org.githubInstallationId) {
    let reachable: Set<string>;
    try {
      reachable = new Set((await listInstallationRepos(org.githubInstallationId)).map((r) => r.fullName));
    } catch (error) {
      if (error instanceof GitHubAppError) throw new ApiError("unavailable", "GitHub didn't list the connected repositories. Try again in a minute.");
      throw error;
    }
    const missing = repos.filter((r) => !reachable.has(r));
    if (missing.length) {
      throw new ApiError("bad_request", `Rosetta's GitHub App can't see ${missing.join(", ")}. Add ${missing.length === 1 ? "it" : "them"} to the installation on GitHub first.`);
    }
  }

  // Branch choices only for watched repos; dropped repos lose theirs.
  const branches: Record<string, string[]> = {};
  for (const [repo, list] of Object.entries({ ...org.branches, ...(patch.branches ? Object.fromEntries(Object.entries(patch.branches).map(([r, b]) => [r.toLowerCase(), b])) : {}) })) {
    const unique = [...new Set(list)];
    if (repos.includes(repo) && unique.length) branches[repo] = unique;
  }

  const next: Org = {
    ...org,
    ...(patch.name ? { name: patch.name } : {}),
    repos,
    branches,
  };
  await store.set("orgs", org.id, next);
  // Map newly watched repos now, so their first push is measured without waiting; forget dropped ones.
  const added = repos.filter((r) => !org.repos.includes(r));
  const dropped = org.repos.filter((r) => !repos.includes(r));
  if (added.length || dropped.length) {
    after(async () => {
      for (const r of dropped) await dropGraph(org.id, r).catch(() => {});
      for (const r of added) await buildLatest(org, r);
    });
  }
  return json({ org: { id: next.id, name: next.name, repos: next.repos, branches: next.branches ?? {} } });
});
