import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { canReview, canSeeCard, orgMembers, requireOrg } from "@/lib/org";
import { limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import { normalizeKey } from "@/lib/task-keys";
import { canLinkTasks, canSeeTask, cardTasks, linkByHand, taskId, unlink, type Task } from "@/lib/tasks";
import type { StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({ key: z.string().trim().min(3).max(20) }).strict();

/**
 * The change and the task, for linking by hand. The change's engineer may link
 * it to any task in the workspace (as a commit message would); a lead only to
 * tasks they can see.
 */
async function load(req: Request, params: Ctx["params"]) {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  const { id } = await params;
  const users = await orgMembers(org.id);
  const card = await store.get<StoredCard>("cards", id);
  if (!card || !canSeeCard(me, card, users)) throw new ApiError("not_found");
  if (!canLinkTasks(me, card, users)) throw new ApiError("forbidden", "Only the engineer who made this change or a lead can link it to a task.");
  const { key: raw } = await readJson(req, body);
  const key = normalizeKey(raw);
  const task = key ? await store.get<Task>("tasks", taskId(org.id, key)) : null;
  if (!task || task.orgId !== org.id || (!canReview(me, card) && !canSeeTask(me, task, users))) {
    throw new ApiError("not_found", `There's no task ${key ?? raw.trim()} in this workspace.`);
  }
  limit(`task-link:${me.id}`, 60, 60 * 60_000);
  return { me, users, card, task };
}

/** POST /api/cards/:id/tasks { key } → { tasks }: links the change, and moves the task along like a commit would. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { me, users, card, task } = await load(req, params);
  const next = (await linkByHand(card, task, users)) ?? card;
  return json({ tasks: await cardTasks(next, me, users) });
});

/** DELETE /api/cards/:id/tasks { key } → { tasks }. The task keeps its column. */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const { me, users, card, task } = await load(req, params);
  const next = (await unlink(card, task)) ?? card;
  return json({ tasks: await cardTasks(next, me, users) });
});
