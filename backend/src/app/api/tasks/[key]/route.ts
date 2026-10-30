import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { orgMembers, personOf, requireOrg } from "@/lib/org";
import { store } from "@/lib/store";
import { normalizeKey } from "@/lib/task-keys";
import { assigneesFor, canSeeTask, forgetTask, moved, PRIORITIES, rightsOn, STATUSES, taskCommits, taskId, taskView, type Task } from "@/lib/tasks";
import type { StoredCard, User } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ key: string }> };

/** The task by key, if this person may see it. "Not yours" and "doesn't exist" answer the same. */
async function load(req: Request, params: Ctx["params"]) {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  const key = normalizeKey(decodeURIComponent((await params).key));
  const task = key ? await store.get<Task>("tasks", taskId(org.id, key)) : null;
  const users = await orgMembers(org.id);
  if (!task || !canSeeTask(me, task, users)) throw new ApiError("not_found");
  return { me, org, task, users };
}

async function cardsOf(t: Task) {
  const cards = await Promise.all(t.cardIds.map((id) => store.get<StoredCard>("cards", id)));
  return new Map(cards.filter((c): c is StoredCard => Boolean(c)).map((c) => [c.id, c]));
}

/** GET /api/tasks/:key → { task: TaskView & { commits }, assignees } */
export const GET = route<Ctx>(async (req, { params }) => {
  const { me, task, users } = await load(req, params);
  const cards = await cardsOf(task);
  const rights = rightsOn(me, task, users);
  return json({
    task: { ...taskView(task, me, users, cards), commits: taskCommits(task, me, users, cards) },
    assignees: rights.assign ? assigneesFor(me, users).map((u) => personOf(u, users)) : [],
  });
});

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5_000).optional(),
    priority: z.enum(PRIORITIES).optional(),
    status: z.enum(STATUSES).optional(),
    order: z.number().finite().optional(),
    assigneeId: z.string().max(100).nullable().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-30.").nullable().optional(),
    sharedWithClient: z.boolean().optional(),
  })
  .strict();

/**
 * PATCH /api/tasks/:key → { task }. Moving (status, order) and editing need the
 * task to be yours or your team's; assigning and sharing with clients are for its lead.
 */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { me, task, users } = await load(req, params);
  const patch = await readJson(req, patchSchema);
  const rights = rightsOn(me, task, users);
  const need = (ok: boolean, what: string) => {
    if (!ok) throw new ApiError("forbidden", `You can't ${what} this task.`);
  };
  if (patch.status !== undefined || patch.order !== undefined) need(rights.move, "move");
  if (patch.title !== undefined || patch.description !== undefined || patch.priority !== undefined || patch.dueDate !== undefined) need(rights.edit, "edit");
  if (patch.assigneeId !== undefined || patch.sharedWithClient !== undefined) need(rights.assign, "reassign or share");
  if (patch.assigneeId && !assigneesFor(me, users).some((u: User) => u.id === patch.assigneeId)) {
    throw new ApiError("forbidden", "You can't give a task to that person.");
  }

  // Re-read so a commit that moved it meanwhile isn't undone by a stale copy.
  const latest = (await store.get<Task>("tasks", task.id)) ?? task;
  let next: Task = patch.status && patch.status !== latest.status ? moved(latest, patch.status, "person") : { ...latest };
  if (patch.order !== undefined) next.order = patch.order;
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.sharedWithClient !== undefined) next.sharedWithClient = patch.sharedWithClient;
  if (patch.dueDate !== undefined) {
    if (patch.dueDate) next.dueDate = patch.dueDate;
    else delete next.dueDate;
  }
  if (patch.assigneeId !== undefined) {
    if (patch.assigneeId) next.assigneeId = patch.assigneeId;
    else delete next.assigneeId;
  }
  next = { ...next, updatedAt: new Date().toISOString() };
  await store.set("tasks", task.id, next);
  return json({ task: taskView(next, me, users, await cardsOf(next)) });
});

/** DELETE /api/tasks/:key: its changes stay, only unlinked. */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const { me, task, users } = await load(req, params);
  if (!rightsOn(me, task, users).delete) throw new ApiError("forbidden", "You can't delete this task.");
  await forgetTask(task);
  await store.remove("tasks", task.id);
  return json({ ok: true });
});
