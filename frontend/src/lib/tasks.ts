import type { Priority, TaskStatus, TaskView } from "./types";

/** The board's columns, left to right. */
export const STATUSES: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "in_review", label: "In review" },
  { key: "done", label: "Done" },
];
export const statusLabel = (key: TaskStatus) => STATUSES.find((s) => s.key === key)?.label ?? key;

export const PRIORITIES: { key: Priority; label: string }[] = [
  { key: "urgent", label: "Urgent" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
];
export const priorityLabel = (key: Priority) => PRIORITIES.find((p) => p.key === key)?.label ?? key;

export const byOrder = (a: TaskView, b: TaskView) => a.order - b.order || a.createdAt.localeCompare(b.createdAt);

/** An order that sorts between two neighbours; either may be missing at a column's ends. */
export function orderBetween(before: TaskView | undefined, after: TaskView | undefined, fallback: number) {
  if (before && after) return (before.order + after.order) / 2;
  if (before) return before.order + 1;
  if (after) return after.order - 1;
  return fallback;
}

/** Today in the reader's time zone, as "YYYY-MM-DD". */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const isOverdue = (task: Pick<TaskView, "dueDate" | "status">) => Boolean(task.dueDate && task.status !== "done" && task.dueDate < today());

/** "30 Oct", or "30 Oct 2027" outside this year. */
export function formatDue(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const value = new Date(y, (m ?? 1) - 1, d ?? 1);
  const thisYear = y === new Date().getFullYear();
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(thisYear ? {} : { year: "numeric" }) });
}

/** "Due today", "Due 30 Oct", "Overdue · 28 Oct". */
export function dueText(task: Pick<TaskView, "dueDate" | "status">) {
  if (!task.dueDate) return null;
  if (isOverdue(task)) return `Overdue · ${formatDue(task.dueDate)}`;
  if (task.dueDate === today() && task.status !== "done") return "Due today";
  return `Due ${formatDue(task.dueDate)}`;
}
