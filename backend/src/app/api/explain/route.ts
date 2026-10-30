import { linkFromMessage } from "@/lib/tasks";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { demoSampleFor, publicCard, resolveCardId } from "@/lib/cards";
import { fetchChange, type Change } from "@/lib/github";
import { parseGitHubLink } from "@/lib/github-url";
import { ApiError, ndjson, pause, preflight, readJson, route } from "@/lib/http";
import { isPitchLink } from "@/lib/demo/pitch";
import { explainPitch } from "@/lib/demo/pitch-card";
import { explanationFor, prepare, prepareWithImpact, toCard, type Stage } from "@/lib/ingest";
import { canReview, canSeeCard, isTechnical, orgMembers, requireOrg } from "@/lib/org";
import { limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import type { StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
// Explaining, checking and one rewrite can take a couple of minutes (the Vercel Hobby maximum is 300 s).
export const maxDuration = 300;
export const OPTIONS = preflight;

const FINDING_GAP_MS = 300;

/** POST /api/explain { url } → NDJSON: start, finding…, writing, card. */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  const { url } = await readJson(req, z.object({ url: z.string().max(500) }));
  const link = parseGitHubLink(url);
  if (!link) throw new ApiError("invalid_url");
  const users = await orgMembers(org.id);
  const id = await resolveCardId(org.id, link);
  const repo = `${link.owner}/${link.repo}`;
  const existing = await store.get<StoredCard>("cards", id);
  const pitch = isPitchLink(link);
  // A pitch card nobody in the workspace wrote yet (a lead rehearsed it) is claimed by the first engineer to paste it.
  const claimable = pitch && !!existing && !existing.authorUserId && isTechnical(me.role);
  // Already in this workspace but not theirs to read (a draft, another team's work): don't show it.
  if (existing && !claimable && !canSeeCard(me, existing, users)) throw new ApiError("not_found", "You don't have access to this change.");
  // Pasting a deleted change brings it back.
  await store.remove("deleted", id);

  // Only whoever explained it (or its author) regenerates it; anyone else just reads it.
  const someoneElses = !!existing && !claimable && !canReview(me, existing) && existing.createdBy !== me.id;
  // The pitch commit: explained afresh, the same way, with no GitHub or AI calls.
  if (pitch && !someoneElses) {
    return ndjson((emit) => explainPitch(id, org, me, users, emit));
  }

  // A pull request that got new pushes since it was explained is explained again
  // (which resets its review), so only by its author or whoever explained it.
  let pushed: Change | undefined;
  if (existing && !someoneElses && !pitch && link.kind === "pull") {
    pushed = await fetchChange(link, org.id).catch(() => undefined);
    if (pushed?.headSha === existing.headSha) pushed = undefined;
  }

  // Already explained in this workspace: replay the story, no GitHub or model calls.
  if (existing && !pushed) {
    return ndjson(async (emit) => {
      emit({ type: "start", title: existing.reading });
      for (const text of existing.findings) {
        await pause(FINDING_GAP_MS / 2);
        emit({ type: "finding", text });
      }
      return publicCard(existing, me, users);
    });
  }
  limit(`explain:${me.id}`, 30, 60 * 60_000);

  const demo = link.kind === "commit" ? demoSampleFor(repo, link.sha) : undefined;
  let change: Change;
  try {
    change = pushed ?? (await fetchChange(link, org.id));
  } catch (error) {
    // Demo commits still work with no Wi-Fi or GitHub.
    if (!demo) throw error;
    change = {
      repo: demo.card.repo,
      ref: demo.card.ref,
      headSha: demo.sha,
      url: demo.card.url,
      subject: demo.reading,
      message: demo.reading,
      author: demo.card.author,
      committedAt: new Date().toISOString(),
      files: demo.card.files.map((f) => ({
        filename: f.path,
        status: "modified",
        additions: f.additions,
        deletions: f.deletions,
        changes: f.additions + f.deletions,
        blob_url: f.url,
      })),
    };
  }

  const prepared = demo ? prepare(change) : await prepareWithImpact(change, org);
  if (demo) {
    prepared.findings = demo.findings;
    prepared.reading = demo.reading;
  }

  return ndjson(async (emit) => {
    emit({ type: "start", title: prepared.reading });
    // Checking and rewriting can start while findings are still showing: hold them until "writing".
    let writing = false;
    let pending: Stage | null = null;
    const explanationPromise = explanationFor(prepared, (stage) => {
      if (writing) emit({ type: stage });
      else pending = stage;
    }, org.id);
    explanationPromise.catch(() => {});
    for (const text of prepared.findings) {
      await pause(FINDING_GAP_MS);
      emit({ type: "finding", text });
    }
    emit({ type: "writing" });
    writing = true;
    if (pending) emit({ type: pending });
    // A pull request explained again stays the same card: same creator, age and reports.
    const card = toCard(id, org, prepared, await explanationPromise, users, existing ? { createdBy: existing.createdBy, source: existing.source } : { createdBy: me.id, source: "manual" });
    // Someone else may have explained (and even reviewed) this exact change meanwhile: keep theirs.
    const latest = await store.get<StoredCard>("cards", id);
    if (latest && latest.headSha === card.headSha) {
      if (!canSeeCard(me, latest, users)) throw new ApiError("not_found", "You don't have access to this change.");
      return publicCard(latest, me, users);
    }
    const next: StoredCard = latest ? { ...card, createdAt: latest.createdAt, ...(latest.reports ? { reports: latest.reports } : {}) } : card;
    await store.set("cards", id, next);
    // A task key in the message ("ROS-12: …") links the task, as it does for pushes.
    return publicCard(demo ? next : await linkFromMessage(org, next, prepared.change.message, users), me, users);
  });
});
