import { notify } from "./notify";
import { canReview, canSeeCard, isLead, isTechnical, personOf, visibleAuthorIds } from "./org";
import { store } from "./store";
import { defaultPrefix, keysIn } from "./task-keys";
import type { Org, StoredCard, User } from "./types";

/**
 * Tasks: the board (To do · In progress · In review · Done) and its link to
 * the code. An engineer writes the task's key in a commit message
 * ("ROS-12: rotate requests"); when that commit is explained, Rosetta links
 * the two and moves the task along, so the task explains its own progress at
 * every reader's level. Nobody writes status updates by hand.
 */

export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
export type Priority = "urgent" | "high" | "medium" | "low";

export const STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];
export const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low"];
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: "To do", in_progress: "In progress", in_review: "In review", done: "Done" };

export type Task = {
  /** `${orgId}_${key in lower case}`: one task per key per workspace. */
  id: string;
  orgId: string;
  key: string;
  number: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId?: string;
  createdBy: string;
  /** YYYY-MM-DD. */
  dueDate?: string;
  /** Shown to the team's clients (their linked work only once reviewed). */
  sharedWithClient?: boolean;
  /** Commit cards linked to it, by card id. */
  cardIds: string[];
  /** Position within its column, ascending. */
  order: number;
  statusChangedAt: string;
  /** Who moved it last: Rosetta (from a commit) or a person. */
  movedBy?: "rosetta" | "person";
  createdAt: string;
  updatedAt: string;
};

export const taskId = (orgId: string, key: string) => `${orgId}_${key.toLowerCase()}`;
export const prefixOf = (org: Pick<Org, "name" | "taskPrefix">) => org.taskPrefix ?? defaultPrefix(org.name);
/** Whose task it counts as, for who sees it: the assignee, else whoever made it. */
const ownerOf = (t: Task) => t.assigneeId ?? t.createdBy;

/* ------------------------------------------------------------------ */
/* Who sees and does what                                              */
/* ------------------------------------------------------------------ */

/**
 * The CMO sees every task; a manager their team's; an engineer their own;
 * a client only tasks shared with them, from the team of the manager who added them.
 */
export function canSeeTask(viewer: User, t: Task, users: User[]) {
  if (t.orgId !== viewer.orgId) return false;
  if (viewer.role === "cmo") return true;
  if (viewer.role === "client") return Boolean(t.sharedWithClient) && visibleAuthorIds(viewer, users).has(ownerOf(t));
  if (viewer.role === "manager") return t.createdBy === viewer.id || visibleAuthorIds(viewer, users).has(ownerOf(t));
  return t.assigneeId === viewer.id || t.createdBy === viewer.id;
}

/** A lead in charge of it: a manager when it's their team's, the CMO only when they made it (read-only otherwise). */
function inCharge(viewer: User, t: Task, users: User[]) {
  if (viewer.role === "manager") return t.createdBy === viewer.id || visibleAuthorIds(viewer, users).has(ownerOf(t));
  if (viewer.role === "cmo") return t.createdBy === viewer.id;
  return false;
}

export type TaskRights = { edit: boolean; move: boolean; assign: boolean; delete: boolean };
const NONE: TaskRights = { edit: false, move: false, assign: false, delete: false };

export function rightsOn(viewer: User, t: Task, users: User[]): TaskRights {
  if (!canSeeTask(viewer, t, users)) return NONE;
  const lead = inCharge(viewer, t, users);
  const mine = isTechnical(viewer.role) && (t.assigneeId === viewer.id || t.createdBy === viewer.id);
  return { edit: lead || mine, move: lead || mine, assign: lead, delete: lead || (mine && t.createdBy === viewer.id) };
}

export const canCreateTasks = (viewer: User) => viewer.role !== "client";

/** Whom this person may give a task to. Engineers: themselves. */
export function assigneesFor(viewer: User, users: User[]) {
  const byName = (a: User, b: User) => a.name.localeCompare(b.name);
  const worker = (u: User) => u.role !== "client" && u.role !== "cmo";
  if (viewer.role === "cmo") return users.filter(worker).sort(byName);
  if (viewer.role === "manager") {
    const mine = visibleAuthorIds(viewer, users);
    return users.filter((u) => worker(u) && mine.has(u.id)).sort(byName);
  }
  if (isTechnical(viewer.role)) return users.filter((u) => u.id === viewer.id);
  return [];
}

/* ------------------------------------------------------------------ */
/* What people get                                                     */
/* ------------------------------------------------------------------ */

const refOf = (c: StoredCard) => (c.ref.kind === "commit" ? c.ref.sha.slice(0, 7) : `#${c.ref.number}`);

/** The linked commits this viewer may see, newest first. */
function linkedCards(t: Task, viewer: User, users: User[], cards: Map<string, StoredCard>) {
  return t.cardIds
    .map((id) => cards.get(id))
    .filter((c): c is StoredCard => Boolean(c && canSeeCard(viewer, c, users)))
    .sort((a, b) => b.committedAt.localeCompare(a.committedAt));
}

/** A task as one viewer gets it; its progress line is the latest linked commit, at their level. */
export function taskView(t: Task, viewer: User, users: User[], cards: Map<string, StoredCard>) {
  const linked = linkedCards(t, viewer, users, cards);
  const person = (id?: string) => {
    const u = id ? users.find((x) => x.id === id) : undefined;
    return u ? personOf(u, users) : null;
  };
  const latest = linked[0];
  return {
    id: t.id,
    key: t.key,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assignee: person(t.assigneeId),
    createdBy: person(t.createdBy),
    dueDate: t.dueDate ?? null,
    sharedWithClient: Boolean(t.sharedWithClient),
    order: t.order,
    commitCount: linked.length,
    progress: latest ? { title: latest.explanation.title, summary: latest.explanation.levels[viewer.role].summary, committedAt: latest.committedAt } : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    statusChangedAt: t.statusChangedAt,
    movedBy: t.movedBy ?? null,
    can: rightsOn(viewer, t, users),
  };
}

/** The linked commits, for the task's page. */
export function taskCommits(t: Task, viewer: User, users: User[], cards: Map<string, StoredCard>) {
  return linkedCards(t, viewer, users, cards).map((c) => {
    const level = c.explanation.levels[viewer.role];
    return {
      cardId: c.id,
      title: c.explanation.title,
      summary: level.summary,
      impact: level.impact,
      risk: c.explanation.risk,
      status: c.status,
      repo: c.repo,
      ref: refOf(c),
      committedAt: c.committedAt,
      authorName: users.find((u) => u.id === (c.authorUserId ?? c.createdBy))?.name ?? c.author.name,
    };
  });
}

/** Tasks shown on a commit card: ones the viewer can see, and all of them to whoever wrote it. */
export async function cardTasks(card: StoredCard, viewer: User, users: User[]) {
  const out: { key: string; title: string; status: TaskStatus }[] = [];
  for (const id of card.taskIds ?? []) {
    const t = await store.get<Task>("tasks", id);
    if (t && t.orgId === card.orgId && (canSeeTask(viewer, t, users) || canReview(viewer, card))) out.push({ key: t.key, title: t.title, status: t.status });
  }
  return out;
}

/** The commit's author links it to tasks; so does a lead who can see the commit. */
export const canLinkTasks = (viewer: User, card: StoredCard, users: User[]) =>
  canReview(viewer, card) || (isLead(viewer.role) && canSeeCard(viewer, card, users));

/* ------------------------------------------------------------------ */
/* Moving along                                                        */
/* ------------------------------------------------------------------ */

const RANK: Record<TaskStatus, number> = { todo: 0, in_progress: 1, in_review: 2, done: 3 };

/** The task in a new column, at its end. */
export function moved(t: Task, status: TaskStatus, by: "rosetta" | "person"): Task {
  const at = new Date().toISOString();
  return { ...t, status, order: Date.now(), statusChangedAt: at, movedBy: by, updatedAt: at };
}

/** Tells the lead of the task's assignee (or its creator) that Rosetta moved it. */
async function tellMoved(t: Task, users: User[]) {
  const owner = users.find((u) => u.id === ownerOf(t));
  const lead = owner && (isLead(owner.role) ? owner : users.find((u) => u.id === owner.managerId));
  if (!lead) return;
  await notify({ orgId: t.orgId, userId: lead.id, kind: "task", title: `Rosetta moved ${t.key} to ${STATUS_LABEL[t.status]}: ${t.title.slice(0, 60)}`, href: `/app/tasks/${t.key}` });
}

/**
 * Links a commit card to a task and moves the task forward, never back: a
 * commit starts it, a pull request puts it in review, and a commit that says it
 * closes the task finishes it once its engineer has reviewed the explanation.
 */
async function attach(t: Task, card: StoredCard, closes: boolean, users: User[]) {
  let next: Task = t.cardIds.includes(card.id) ? t : { ...t, cardIds: [...t.cardIds, card.id], updatedAt: new Date().toISOString() };
  const target: TaskStatus = closes && card.status === "approved" ? "done" : card.ref.kind === "pull" ? "in_review" : "in_progress";
  const forward = RANK[target] > RANK[next.status];
  if (forward) next = moved(next, target, "rosetta");
  if (next !== t) await store.set("tasks", t.id, next);
  if (forward) await tellMoved(next, users);
  return next;
}

/** Writes the card's task links: the latest card, so nothing written meanwhile is lost. */
async function saveCardLinks(cardId: string, change: (c: StoredCard) => Pick<StoredCard, "taskIds" | "closesTaskIds">) {
  const latest = await store.get<StoredCard>("cards", cardId);
  if (!latest) return null;
  const next: StoredCard = { ...latest, ...change(latest) };
  await store.set("cards", cardId, next);
  return next;
}

/**
 * Links a newly explained change to the tasks its commit message names.
 * Keys that look like this workspace's but match no task are reported to the
 * engineer, never guessed; other keys (another tool's "PAY-12", "UTF-8") are
 * ignored. Tasks are looked up in this workspace only. Never throws.
 */
export async function linkFromMessage(org: Org, card: StoredCard, message: string, users: User[]): Promise<StoredCard> {
  try {
    const { keys, closes } = keysIn(message);
    if (!keys.length) return card;
    const prefix = `${prefixOf(org)}-`;
    const linked: Task[] = [];
    const unknown: string[] = [];
    for (const key of keys.slice(0, 10)) {
      const t = await store.get<Task>("tasks", taskId(org.id, key));
      if (t && t.orgId === org.id) linked.push(await attach(t, card, closes.includes(key), users));
      else if (key.startsWith(prefix)) unknown.push(key);
    }
    const author = card.authorUserId ?? card.createdBy;
    if (unknown.length && author) {
      await notify({
        orgId: org.id,
        userId: author,
        kind: "task",
        title: `${unknown.join(", ")} in your commit ${unknown.length === 1 ? "doesn't match a task" : "don't match any task"}. Link it by hand if you meant another.`,
        href: `/app/c/${card.id}`,
      });
    }
    if (!linked.length) return card;
    const ids = linked.map((t) => t.id);
    const closing = linked.filter((t) => closes.includes(t.key)).map((t) => t.id);
    return (
      (await saveCardLinks(card.id, (c) => ({
        taskIds: [...new Set([...(c.taskIds ?? []), ...ids])],
        closesTaskIds: [...new Set([...(c.closesTaskIds ?? []), ...closing])],
      }))) ?? card
    );
  } catch (error) {
    console.warn("[rosetta] linking tasks failed:", error instanceof Error ? error.message : error);
    return card;
  }
}

/** Links by hand ("Link to task" on a change). */
export async function linkByHand(card: StoredCard, t: Task, users: User[]) {
  await attach(t, card, false, users);
  return saveCardLinks(card.id, (c) => ({ taskIds: [...new Set([...(c.taskIds ?? []), t.id])], closesTaskIds: c.closesTaskIds }));
}

export async function unlink(card: StoredCard, t: Task) {
  const fresh = await store.get<Task>("tasks", t.id);
  if (fresh) await store.set<Task>("tasks", t.id, { ...fresh, cardIds: fresh.cardIds.filter((id) => id !== card.id), updatedAt: new Date().toISOString() });
  return saveCardLinks(card.id, (c) => ({ taskIds: (c.taskIds ?? []).filter((id) => id !== t.id), closesTaskIds: (c.closesTaskIds ?? []).filter((id) => id !== t.id) }));
}

/** The engineer reviewed a change: tasks its commit said it closes are done. */
export async function closeOnApproval(card: StoredCard, users: User[]) {
  for (const id of card.closesTaskIds ?? []) {
    const t = await store.get<Task>("tasks", id);
    if (t && t.orgId === card.orgId) await attach(t, card, true, users).catch(() => {});
  }
}

/** A change was deleted: its tasks forget it. */
export async function forgetCard(card: StoredCard) {
  for (const id of card.taskIds ?? []) {
    const t = await store.get<Task>("tasks", id);
    if (t) await store.set<Task>("tasks", id, { ...t, cardIds: t.cardIds.filter((c) => c !== card.id) });
  }
}

/** A task was deleted: its changes forget it. */
export async function forgetTask(t: Task) {
  for (const cardId of t.cardIds) {
    await saveCardLinks(cardId, (c) => ({ taskIds: (c.taskIds ?? []).filter((x) => x !== t.id), closesTaskIds: (c.closesTaskIds ?? []).filter((x) => x !== t.id) }));
  }
}

/** A member left: their tasks lose their assignee, and the ones they made pass to whoever took over their reports. */
export async function releaseMember(orgId: string, memberId: string, heirId: string) {
  for (const t of await store.list<Task>("tasks", "orgId", orgId)) {
    if (t.assigneeId !== memberId && t.createdBy !== memberId) continue;
    const next: Task = { ...t, createdBy: t.createdBy === memberId ? heirId : t.createdBy, updatedAt: new Date().toISOString() };
    if (next.assigneeId === memberId) delete next.assigneeId;
    await store.set("tasks", t.id, next);
  }
}

/** The next free key in the workspace: ROS-1, ROS-2, … */
export async function nextKey(org: Org) {
  const latest = (await store.get<Org>("orgs", org.id)) ?? org;
  const prefix = prefixOf(latest);
  let n = (latest.taskCounter ?? 0) + 1;
  while (await store.get("tasks", taskId(org.id, `${prefix}-${n}`))) n++;
  await store.set<Org>("orgs", org.id, { ...latest, taskCounter: n });
  return { key: `${prefix}-${n}`, number: n };
}
