import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { orgMembers, personOf, requireOrg } from "@/lib/org";
import { limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import { assigneesFor, canCreateTasks, canSeeTask, nextKey, prefixOf, PRIORITIES, STATUSES, taskId, taskView, type Task } from "@/lib/tasks";
import type { StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * GET /api/tasks?assignee=&priority=&q= → { tasks, prefix, canCreate, assignees, people }
 * The board: every task this person may see, each with its latest linked
 * commit at their reading level. `assignees`: whom they may give a task to;
 * `people`: who to offer in the filter.
 */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  const users = await orgMembers(org.id);
  const params = new URL(req.url).searchParams;
  const [tasks, cards] = await Promise.all([store.list<Task>("tasks", "orgId", org.id), store.list<StoredCard>("cards", "orgId", org.id)]);
  const byId = new Map(cards.map((c) => [c.id, c]));

  let visible = tasks.filter((t) => canSeeTask(me, t, users));
  const people = [...new Set(visible.map((t) => t.assigneeId).filter(Boolean))]
    .map((id) => users.find((u) => u.id === id))
    .filter((u) => u !== undefined)
    .map((u) => personOf(u, users));

  const assignee = params.get("assignee");
  const priority = params.get("priority");
  const q = params.get("q")?.trim().toLowerCase();
  if (assignee) visible = visible.filter((t) => (assignee === "none" ? !t.assigneeId : t.assigneeId === assignee));
  if (priority) visible = visible.filter((t) => t.priority === priority);
  if (q) visible = visible.filter((t) => [t.key, t.title, t.description].some((s) => s.toLowerCase().includes(q)));

  return json({
    tasks: visible.sort((a, b) => a.order - b.order).map((t) => taskView(t, me, users, byId)),
    prefix: prefixOf(org),
    canCreate: canCreateTasks(me),
    assignees: assigneesFor(me, users).map((u) => personOf(u, users)),
    people,
  });
});

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-30.");

const createSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5_000).default(""),
    priority: z.enum(PRIORITIES).default("medium"),
    status: z.enum(STATUSES).default("todo"),
    assigneeId: z.string().max(100).optional(),
    dueDate: day.optional(),
    sharedWithClient: z.boolean().optional(),
  })
  .strict();

/** POST /api/tasks { title, description?, priority?, status?, assigneeId?, dueDate?, sharedWithClient? } → 201 { task } */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  if (!canCreateTasks(me)) throw new ApiError("forbidden", "Clients can't create tasks.");
  limit(`task-create:${me.id}`, 100, 60 * 60_000);
  const input = await readJson(req, createSchema);
  const users = await orgMembers(org.id);

  // Engineers make tasks for themselves; leads for anyone they manage.
  const allowed = assigneesFor(me, users);
  const assigneeId = input.assigneeId ?? (allowed.length === 1 && allowed[0].id === me.id ? me.id : undefined);
  if (assigneeId && !allowed.some((u) => u.id === assigneeId)) throw new ApiError("forbidden", "You can't give a task to that person.");
  if (input.sharedWithClient && me.role !== "manager" && me.role !== "cmo") throw new ApiError("forbidden", "Only a manager or the CMO can share a task with clients.");

  const { key, number } = await nextKey(org);
  const at = new Date().toISOString();
  const task: Task = {
    id: taskId(org.id, key),
    orgId: org.id,
    key,
    number,
    title: input.title,
    description: input.description,
    status: input.status,
    priority: input.priority,
    ...(assigneeId ? { assigneeId } : {}),
    createdBy: me.id,
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    ...(input.sharedWithClient ? { sharedWithClient: true } : {}),
    cardIds: [],
    order: Date.now(),
    statusChangedAt: at,
    createdAt: at,
    updatedAt: at,
  };
  await store.set("tasks", task.id, task);
  return json({ task: taskView(task, me, users, new Map()) }, 201);
});
