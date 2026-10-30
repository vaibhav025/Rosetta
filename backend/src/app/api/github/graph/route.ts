import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { buildLatest, graphsOf } from "@/lib/codegraph";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { isLead, requireOrg } from "@/lib/org";
import { limit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
// A rebuild runs after the answer and can take a minute or two.
export const maxDuration = 300;
export const OPTIONS = preflight;

/**
 * GET /api/github/graph → { graphs: [{ repo, status, files, languages, headSha, builtAt, updatedAt, truncated, error }] }
 * The repository map of each watched repo: what each explained commit is
 * measured against to find the code beyond its diff that relies on it.
 * status: missing · building · ready · failed · too_large.
 */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  if (!isLead(me.role) && org.ownerId !== me.id) throw new ApiError("forbidden", "Only a CMO or manager can see the repository maps.");
  return json({ graphs: await graphsOf(org) });
});

/** POST /api/github/graph { repo } → 202: maps the repo again from its newest commit, in the background. */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  if (!isLead(me.role) && org.ownerId !== me.id) throw new ApiError("forbidden", "Only a CMO or manager can rebuild a repository map.");
  const { repo } = await readJson(req, z.object({ repo: z.string().trim().min(3).max(200) }).strict());
  const name = repo.toLowerCase();
  if (!org.repos.includes(name)) throw new ApiError("bad_request", "Rosetta doesn't watch that repository.");
  limit(`graph-rebuild:${org.id}:${name}`, 3, 60 * 60_000);
  after(() => buildLatest(org, name));
  return json({ ok: true, repo: name, status: "building" }, 202);
});
