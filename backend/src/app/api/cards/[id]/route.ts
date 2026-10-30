import { cardTasks, forgetCard } from "@/lib/tasks";
import { requireUser } from "@/lib/auth";
import { publicCard } from "@/lib/cards";
import { ApiError, json, preflight, route } from "@/lib/http";
import { canReview, canSeeCard, orgMembers, personOf, requireOrg } from "@/lib/org";
import type { Notification } from "@/lib/notify";
import { store } from "@/lib/store";
import { after } from "next/server";
import { backfill, displayFor } from "@/lib/translate";
import type { Comment, StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/cards/:id → the card at the viewer's level, with the engineers' comments. */
export const GET = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const card = await store.get<StoredCard>("cards", id);
  const users = await orgMembers(me.orgId);
  // Same answer for "doesn't exist" and "not yours".
  if (!card || !canSeeCard(me, card, users)) throw new ApiError("not_found");

  const stored = await store.list<Comment>("comments", "cardId", id);
  // Translate older comments in the background; the next visit shows them.
  if (stored.some((c) => !c.levels)) {
    after(async () => {
      const nameOf = (uid: string) => users.find((u) => u.id === uid)?.name ?? "An engineer";
      if (await backfill(stored, nameOf, card.explanation.title)) for (const c of stored) await store.set("comments", c.id, c);
    });
  }
  const comments = stored
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((c) => {
      const author = users.find((u) => u.id === c.authorId);
      return {
        id: c.id,
        author: author ? personOf(author, users) : null,
        source: c.source,
        githubUrl: c.githubUrl,
        createdAt: c.createdAt,
        ...displayFor(c, me),
      };
    });

  return json({ ...publicCard(card, me, users), comments, tasks: await cardTasks(card, me, users) });
});

/**
 * DELETE /api/cards/:id: the engineer who made the change (or the workspace
 * owner) removes it, with its comments and notifications. Paste the link
 * again to bring it back; sync won't re-add it on its own.
 */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const card = await store.get<StoredCard>("cards", id);
  const users = await orgMembers(me.orgId);
  if (!card || !canSeeCard(me, card, users)) throw new ApiError("not_found");
  const org = await requireOrg(me);
  if (!canReview(me, card) && org.ownerId !== me.id) {
    throw new ApiError("forbidden", "Only the engineer who made this change can delete it.");
  }

  const [comments, notes] = await Promise.all([
    store.list<Comment>("comments", "cardId", id),
    store.list<Notification>("notifications", "orgId", me.orgId),
  ]);
  await Promise.all([
    store.remove("cards", id),
    ...comments.map((c) => store.remove("comments", c.id)),
    ...notes.filter((n) => n.href === `/app/c/${id}`).map((n) => store.remove("notifications", n.id)),
  ]);
  await forgetCard(card);
  await store.set("deleted", id, { id, orgId: me.orgId, repo: card.repo, by: me.id, at: new Date().toISOString() });
  return json({ deleted: id });
});
