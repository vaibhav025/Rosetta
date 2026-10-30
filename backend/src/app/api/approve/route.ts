import { closeOnApproval } from "@/lib/tasks";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { editsSchema, publicCard } from "@/lib/cards";
import { applyEdits } from "@/lib/edits";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { after } from "next/server";
import { notifications } from "@/lib/notify";
import { canReview, orgMembers } from "@/lib/org";
import { store } from "@/lib/store";
import type { CardEdits, StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** POST /api/approve { cardId, edits }: the engineer checks and marks their change reviewed. */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  const { cardId, edits } = await readJson(req, z.object({ cardId: z.string(), edits: editsSchema.default({}) }));
  const card = await store.get<StoredCard>("cards", cardId);
  if (!card || card.orgId !== me.orgId) throw new ApiError("not_found");
  if (!canReview(me, card)) throw new ApiError("forbidden", "Only the engineer who made this change can review it.");

  const approved: StoredCard = {
    ...card,
    explanation: applyEdits(card.explanation, edits as CardEdits),
    status: "approved",
    approvedBy: me.name,
    approvedAt: new Date().toISOString(),
  };
  await store.set("cards", cardId, approved);
  const users = await orgMembers(me.orgId);
  // "fixes ROS-12" in its commit: reviewing it finishes the task.
  await closeOnApproval(approved, users);
  // Their manager hears that it's been checked.
  const manager = me.managerId ? users.find((u) => u.id === me.managerId) : undefined;
  if (manager) after(() => notifications.reviewed({ orgId: me.orgId, to: manager.id, authorName: me.name, title: approved.explanation.title, cardId }));
  return json({ card: publicCard(approved, me, users) });
});
