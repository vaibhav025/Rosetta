"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type RefObject } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { errorText } from "@/lib/errors";
import { canOpen, isLead, isTechnical } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { byOrder, dueText, isOverdue, orderBetween, PRIORITIES, priorityLabel, STATUSES, statusLabel } from "@/lib/tasks";
import type { Priority, TaskBoard, TaskStatus, TaskView } from "@/lib/types";
import { cn, firstName, timeAgo } from "@/lib/utils";
import { LoadError, NotForRole, Page } from "./app-shell";
import { Button } from "./button";
import { FilterChips, personChip, selectClass } from "./feed";
import { inputClass } from "./form";
import { CloseIcon, ICON_STROKE } from "./icons";
import { Avatar } from "./person";

/* ------------------------------------------------------------------ */
/* Shared bits (also used by the task page and the change page)        */
/* ------------------------------------------------------------------ */

/** Urgent and high get a colour; medium and low stay quiet. Word + dot, never colour alone. */
const PRIORITY_TONE: Record<Priority, string | null> = { urgent: "var(--risk-high)", high: "var(--risk-medium)", medium: null, low: null };

export function PriorityTag({ priority, className }: { priority: Priority; className?: string }) {
  const tone = PRIORITY_TONE[priority];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 t-micro", tone ? "text-(--tone)" : "text-fg-3", className)}
      style={tone ? ({ "--tone": tone } as CSSProperties) : undefined}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          priority === "low" ? "shadow-[inset_0_0_0_1px_currentColor]" : "bg-current",
          priority === "urgent" && "shadow-[0_0_0_3px_color-mix(in_srgb,var(--tone)_20%,transparent)]",
        )}
      />
      {priorityLabel(priority)}
      <span className="sr-only"> priority</span>
    </span>
  );
}

const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "shadow-[inset_0_0_0_1.5px_var(--text-3)]",
  in_progress: "bg-(--risk-medium)",
  in_review: "bg-accent-ink",
  done: "bg-(--risk-low)",
};

export function StatusPill({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-xs bg-surface-2 px-2 t-micro text-fg-2", className)}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status])} />
      {statusLabel(status)}
    </span>
  );
}

function CommitIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M3 12h5.5M15.5 12H21" />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* The board                                                           */
/* ------------------------------------------------------------------ */

type Drop = { status: TaskStatus; index: number };

/**
 * Tasks in four columns. Commits that name a task move it along on their
 * own; people move cards by dragging, or with each card's Move menu
 * (keyboards and touch screens can't drag).
 */
export function Board() {
  const { user } = useSession();
  const router = useRouter();
  const [board, setBoard] = useState<TaskBoard | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [priority, setPriority] = useState("");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [live, setLive] = useState("");
  // After a move from the menu, focus follows the card to its new place.
  const refocus = useRef<string | null>(null);
  const allowed = user ? canOpen(user.role, "/app/tasks") : false;
  const filtered = Boolean(assignee || priority || q);

  // Search waits for a pause in typing.
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!allowed) return;
    let current = true;
    api
      .getTasks({ assignee: assignee ?? undefined, priority: priority || undefined, q: q || undefined })
      .then((b) => {
        if (!current) return;
        setBoard(b);
        setFailed(false);
      })
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [allowed, assignee, priority, q, attempt]);

  useEffect(() => {
    const key = refocus.current;
    if (!key) return;
    refocus.current = null;
    const timer = window.setTimeout(() => document.querySelector<HTMLElement>(`[data-move-trigger="${CSS.escape(key)}"]`)?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [board]);

  if (user && !allowed) return <NotForRole title="Tasks" />;
  if (failed && !board)
    return (
      <Page title="Tasks">
        <LoadError message="Tasks can't load right now." onRetry={() => setAttempt((n) => n + 1)} />
      </Page>
    );
  if (!user || !board)
    return (
      <Page title="Tasks">
        <p className="t-body text-fg-3" role="status">
          Loading…
        </p>
      </Page>
    );

  const tasks = board.tasks;
  const replace = (task: TaskView) => setBoard((b) => b && { ...b, tasks: b.tasks.map((t) => (t.id === task.id ? task : t)) });
  const column = (status: TaskStatus) => tasks.filter((t) => t.status === status).sort(byOrder);

  /** at: the place in the target column, counted without the moving card; past the end means last. */
  const move = async (task: TaskView, status: TaskStatus, at: number) => {
    const current = column(status);
    const others = current.filter((t) => t.id !== task.id);
    const index = Math.max(0, Math.min(at, others.length));
    const changed = status !== task.status;
    if (!changed && current.findIndex((t) => t.id === task.id) === index) return;
    const order = orderBetween(others[index - 1], others[index], task.order);
    replace({ ...task, status, order, ...(changed ? { movedBy: "person" as const, statusChangedAt: new Date().toISOString() } : {}) });
    setLive(changed ? `Moved ${task.key} to ${statusLabel(status)}.` : `Moved ${task.key} to place ${index + 1} of ${current.length} in ${statusLabel(status)}.`);
    try {
      const { task: saved } = await api.updateTask(task.key, changed ? { status, order } : { order });
      replace(saved);
    } catch (e) {
      replace(task);
      setLive(`${task.key} didn't move.`);
      toast(errorText(e, `${task.key} didn't move. Try again in a minute.`));
    }
  };

  const moveFromMenu = (task: TaskView, status: TaskStatus, index: number) => {
    refocus.current = task.key;
    void move(task, status, index);
  };

  /* Native drag and drop: the drop line sits where the pointer is between cards. */
  const onDragOver = (e: DragEvent<HTMLElement>, status: TaskStatus) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const cards = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-task-id]")).filter((el) => el.dataset.taskId !== dragId);
    let index = cards.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    if (index === -1) index = cards.length;
    setDrop((d) => (d?.status === status && d.index === index ? d : { status, index }));
  };
  const onDragLeave = (e: DragEvent<HTMLElement>, status: TaskStatus) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop((d) => (d?.status === status ? null : d));
  };
  const onDrop = (e: DragEvent<HTMLElement>, status: TaskStatus) => {
    if (!dragId) return;
    e.preventDefault();
    const task = tasks.find((t) => t.id === dragId);
    const index = drop?.status === status ? drop.index : column(status).filter((t) => t.id !== dragId).length;
    setDragId(null);
    setDrop(null);
    if (task) void move(task, status, index);
  };

  const example = `${board.prefix}-12`;
  const technical = isTechnical(user.role);
  const client = user.role === "client";

  return (
    <Page
      title="Tasks"
      lead={
        client
          ? "What the team is working on for you, and what's been done on each so far."
          : technical
            ? "Your tasks, and what each commit did for them, linked as you push."
            : "Your team's tasks, with what's actually been done on each, explained for you."
      }
      actions={
        board.canCreate && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            New task
          </Button>
        )
      }
    >
      <div className="grid gap-4">
        {board.people.length > 1 && (
          <FilterChips label="Person" options={board.people} value={assignee} onChange={setAssignee} render={personChip} />
        )}
        <div role="search" aria-label="Search and filter tasks" className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-0 flex-1 basis-56 gap-1">
            <span className="t-micro text-fg-3">Search</span>
            <span className="relative">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Words or a key, like ${example}`}
                aria-label="Search tasks"
                className="h-9 w-full rounded-sm bg-surface-1 pr-3 pl-9 t-small text-fg-1 shadow-ring outline-none placeholder:text-fg-3 focus-visible:shadow-[0_0_0_2px_var(--focus)] pointer-coarse:h-11"
              />
            </span>
          </label>
          <label className="grid gap-1">
            <span className="t-micro text-fg-3">Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectClass}>
              <option value="">Any priority</option>
              {PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setAssignee(null);
                setPriority("");
                setQuery("");
                setQ("");
              }}
              className="h-9 px-2 t-small text-fg-3 underline underline-offset-4 hover:text-fg-1 pointer-coarse:h-11"
            >
              Clear filters
            </button>
          )}
        </div>
        {!client && (
          <p className="t-small text-pretty text-fg-2">
            {technical ? "Put " : "Engineers put "}
            <code className="rounded-xs bg-surface-2 px-1.5 py-0.5 t-code text-fg-1">{example}</code> in a commit message and Rosetta links it. The first
            commit moves the task to In progress, a pull request to In review, and &ldquo;fixes {example}&rdquo; to Done once the engineer reviews the
            explanation.
          </p>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {live}
      </p>

      <div
        className="mx-[calc(var(--gutter)*-1)] mt-6 grid snap-x snap-mandatory auto-cols-[min(18rem,calc(100vw-48px))] grid-flow-col gap-3 overflow-x-auto scroll-px-(--gutter) px-(--gutter) pb-2 lg:mx-0 lg:snap-none lg:grid-flow-row lg:grid-cols-4 lg:overflow-visible lg:px-0"
      >
        {STATUSES.map((s) => {
          const items = column(s.key);
          const target = drop?.status === s.key ? drop.index : null;
          let place = 0;
          return (
            <section
              key={s.key}
              aria-labelledby={`column-${s.key}`}
              onDragOver={(e) => onDragOver(e, s.key)}
              onDragLeave={(e) => onDragLeave(e, s.key)}
              onDrop={(e) => onDrop(e, s.key)}
              className={cn(
                "flex min-w-0 snap-start flex-col rounded-md p-2 shadow-ring transition-colors duration-150",
                target !== null && "bg-surface-1/60",
              )}
            >
              <div className="flex items-baseline justify-between gap-2 px-2 pt-1 pb-3">
                <h2 id={`column-${s.key}`} className="t-small font-semibold text-fg-1">
                  {s.label}
                </h2>
                <span className="t-micro text-fg-3 tabular-nums">
                  {items.length}
                  <span className="sr-only">{items.length === 1 ? " task" : " tasks"}</span>
                </span>
              </div>
              <ul className="grid min-h-24 flex-1 content-start gap-2">
                {items.map((task, i) => {
                  const dragged = task.id === dragId;
                  const line = !dragged && target === place;
                  if (!dragged) place++;
                  return (
                    <Fragment key={task.id}>
                      {line && <DropLine />}
                      <TaskCard
                        task={task}
                        index={i}
                        count={items.length}
                        dragging={dragged}
                        refocus={refocus}
                        onDragStart={() => setDragId(task.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setDrop(null);
                        }}
                        onMove={(status, index) => moveFromMenu(task, status, index)}
                      />
                    </Fragment>
                  );
                })}
                {target !== null && target >= place && <DropLine />}
                {items.length === 0 && (
                  <li className="rounded-sm border border-dashed border-(--ring-strong) px-3 py-6 text-center t-small text-pretty text-fg-3">
                    {filtered ? "Nothing here matches these filters." : EMPTY[s.key](client)}
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      <NewTask
        open={creating}
        onOpenChange={setCreating}
        board={board}
        onCreated={(task) => {
          setAttempt((n) => n + 1);
          toast(`${task.key} created.`, { action: { label: "Open", onClick: () => router.push(`/app/tasks/${task.key}`) } });
        }}
      />
    </Page>
  );
}

const EMPTY: Record<TaskStatus, (client: boolean) => string> = {
  todo: () => "Nothing waiting.",
  in_progress: (client) => (client ? "Nothing in progress right now." : "Nothing in progress. The first commit that names a task moves it here."),
  in_review: (client) => (client ? "Nothing in review right now." : "Nothing in review. A pull request that names a task moves it here."),
  done: () => "Nothing done yet.",
};

function DropLine() {
  return <li aria-hidden className="-my-[3px] h-0.5 rounded-full bg-focus" />;
}

function TaskCard({
  task,
  index,
  count,
  dragging,
  refocus,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  task: TaskView;
  index: number;
  count: number;
  dragging: boolean;
  refocus: RefObject<string | null>;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (status: TaskStatus, index: number) => void;
}) {
  const due = dueText(task);
  const overdue = isOverdue(task);
  return (
    <li
      data-task-id={task.id}
      draggable={task.can.move}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.key);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "relative rounded-sm bg-surface-1 p-3.5 shadow-elev-1 transition-[box-shadow,opacity] duration-150 hover:shadow-elev-2",
        task.can.move && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      <div className="flex min-h-6 items-center gap-2">
        <span className="t-mono text-fg-3">{task.key}</span>
        <PriorityTag priority={task.priority} />
        {task.can.move && <MoveMenu task={task} index={index} count={count} refocus={refocus} onMove={onMove} />}
      </div>
      <h3 className="mt-1 t-small font-semibold text-pretty break-words text-fg-1">
        {/* The link covers the card; the Move menu sits above it. */}
        <Link
          href={`/app/tasks/${encodeURIComponent(task.key)}`}
          draggable={false}
          className="outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:shadow-[0_0_0_2px_var(--focus)]"
        >
          {task.title}
        </Link>
      </h3>
      {task.progress && (
        <p className="mt-1.5 line-clamp-2 t-micro font-normal text-pretty text-fg-2">
          <span className="sr-only">Done so far: </span>
          {task.progress.summary}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 t-micro text-fg-3">
        {task.assignee ? (
          <span className="inline-flex min-w-0 items-center gap-1.5" title={task.assignee.name}>
            <Avatar name={task.assignee.name} size={20} />
            <span className="sr-only">Assigned to </span>
            <span className="truncate">{firstName(task.assignee.name)}</span>
          </span>
        ) : (
          <span>Unassigned</span>
        )}
        {due && <span className={cn(overdue && "font-semibold text-(--risk-high)")}>{due}</span>}
        {task.commitCount > 0 && (
          <span className="inline-flex items-center gap-1" title={task.commitCount === 1 ? "1 linked commit" : `${task.commitCount} linked commits`}>
            <CommitIcon />
            <span className="tabular-nums">{task.commitCount}</span>
            <span className="sr-only">{task.commitCount === 1 ? " linked commit" : " linked commits"}</span>
          </span>
        )}
        {task.movedBy === "rosetta" && (
          <span className="ml-auto inline-flex items-center gap-1 text-accent-ink" title={`Rosetta moved it here ${timeAgo(task.statusChangedAt)}, when a commit landed`}>
            <span aria-hidden className="size-1.5 rounded-full bg-current" />
            Moved by Rosetta
          </span>
        )}
      </div>
    </li>
  );
}

/** The keyboard and touch way to move a card: up, down, or to another column. */
function MoveMenu({
  task,
  index,
  count,
  refocus,
  onMove,
}: {
  task: TaskView;
  index: number;
  count: number;
  refocus: RefObject<string | null>;
  onMove: (status: TaskStatus, index: number) => void;
}) {
  const item = "press flex h-9 cursor-pointer items-center rounded-xs px-3 t-small text-fg-1 outline-none data-[highlighted]:bg-surface-2 pointer-coarse:h-11";
  return (
    <Menu.Root>
      <Menu.Trigger
        data-move-trigger={task.key}
        aria-label={`Move ${task.key}`}
        className="press relative z-10 -my-1 -mr-1.5 ml-auto grid size-8 place-items-center rounded-xs text-fg-3 outline-none hover:bg-surface-2 hover:text-fg-1 focus-visible:shadow-[0_0_0_2px_var(--focus)] data-[popup-open]:bg-surface-2 pointer-coarse:size-11"
      >
        <MoveIcon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          {/* After a move the old trigger is gone; the board puts focus on the card's new one. */}
          <Menu.Popup finalFocus={() => !refocus.current} className="menu-popup w-52 rounded-md bg-surface-1 p-1.5 shadow-elev-2 outline-none">
            {index > 0 && (
              <Menu.Item className={item} onClick={() => onMove(task.status, index - 1)}>
                Move up
              </Menu.Item>
            )}
            {index < count - 1 && (
              <Menu.Item className={item} onClick={() => onMove(task.status, index + 1)}>
                Move down
              </Menu.Item>
            )}
            <Menu.Group>
              <Menu.GroupLabel className="px-3 pt-2 pb-1 t-micro text-fg-3">Move to</Menu.GroupLabel>
              {STATUSES.filter((s) => s.key !== task.status).map((s) => (
                <Menu.Item key={s.key} className={item} onClick={() => onMove(s.key, Number.MAX_SAFE_INTEGER)}>
                  {s.label}
                </Menu.Item>
              ))}
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/* ------------------------------------------------------------------ */
/* New task                                                            */
/* ------------------------------------------------------------------ */

function NewTask({
  open,
  onOpenChange,
  board,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  board: TaskBoard;
  onCreated: (task: TaskView) => void;
}) {
  const { user } = useSession();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Only managers and the CMO decide what a client sees.
  const canShare = user ? isLead(user.role) : false;
  const mine = board.assignees.some((p) => p.id === user?.id) && !canShare ? (user?.id ?? "") : "";

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setPriority("medium");
    setAssigneeId(mine);
    setDueDate("");
    setShared(false);
    setError(null);
  }, [open, mine]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the task a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { task } = await api.createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assigneeId: assigneeId || undefined,
        dueDate: dueDate || undefined,
        sharedWithClient: canShare ? shared : undefined,
      });
      onOpenChange(false);
      onCreated(task);
    } catch (err) {
      setError(errorText(err, "That task didn't save. Try again in a minute."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 z-50 bg-abyss/50" />
        <Dialog.Popup className="dialog-popup fixed top-1/2 left-1/2 z-50 max-h-[calc(100svh-32px)] w-[min(34rem,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-surface-1 p-6 shadow-elev-3 outline-none sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="t-heading text-fg-1">New task</Dialog.Title>
              <Dialog.Description className="mt-1 t-small text-fg-2">
                It starts in To do. Put its key in a commit message and Rosetta moves it along.
              </Dialog.Description>
            </div>
            <Dialog.Close className="press -mt-1 -mr-2 grid size-10 place-items-center rounded-sm text-fg-2 hover:bg-surface-2" aria-label="Close">
              <CloseIcon className="ico" />
            </Dialog.Close>
          </div>

          <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
            <label className="grid gap-2">
              <span className="t-small font-medium text-fg-1">
                Title <span className="font-normal text-fg-3">(required)</span>
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputClass}
                placeholder="Rotate the payment API keys"
                maxLength={200}
                required
                aria-invalid={error && !title.trim() ? true : undefined}
              />
            </label>
            <label className="grid gap-2">
              <span className="t-small font-medium text-fg-1">
                Description <span className="font-normal text-fg-3">(optional)</span>
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What needs to happen, and why"
                className={`${inputClass} h-auto! resize-none rounded-sm! py-2.5`}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="t-small font-medium text-fg-1">Priority</span>
                <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inputClass}>
                  {PRIORITIES.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="t-small font-medium text-fg-1">
                  Due date <span className="font-normal text-fg-3">(optional)</span>
                </span>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
              </label>
            </div>
            {board.assignees.length > 0 && (
              <label className="grid gap-2">
                <span className="t-small font-medium text-fg-1">Assignee</span>
                <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputClass}>
                  <option value="">Nobody yet</option>
                  {board.assignees.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === user?.id ? `${p.name} (you)` : p.name}
                      {p.team ? ` · ${p.team.name}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {canShare && (
              <label className="flex cursor-pointer items-start gap-3 t-small text-fg-1">
                <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="mt-0.5 size-5 shrink-0 cursor-pointer accent-(--btn-primary-bg)" />
                <span>
                  Share with the client
                  <span className="block t-micro text-fg-3">They see it on their board, with progress written for them.</span>
                </span>
              </label>
            )}
            {error && (
              <p role="alert" className="t-small font-medium text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Dialog.Close className="press inline-flex h-10 items-center rounded-sm px-4 t-small font-medium text-(--ghost-fg) hover:bg-surface-2">
                Cancel
              </Dialog.Close>
              <Button type="submit" variant="primary" loading={saving}>
                Create task
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
