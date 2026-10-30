"use client";

import { Dialog } from "@base-ui/react/dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { errorText } from "@/lib/errors";
import { canOpen, isLead, isTechnical } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { dueText, isOverdue, PRIORITIES, STATUSES, statusLabel } from "@/lib/tasks";
import type { Person, Priority, TaskCommit, TaskDetail, TaskStatus } from "@/lib/types";
import { cn, firstName, timeAgo } from "@/lib/utils";
import { NotForRole } from "./app-shell";
import { PriorityTag, StatusPill } from "./board";
import { Button, buttonStyles } from "./button";
import { TrashIcon } from "./delete-change";
import { Editable } from "./editable";
import { selectClass } from "./feed";
import { Avatar, PersonLine } from "./person";
import { RiskBadge } from "./risk-badge";

type State = { status: "loading" } | { status: "error"; code: string } | { status: "ready"; task: TaskDetail; assignees: Person[] };

export function TaskView({ taskKey }: { taskKey: string }) {
  const { user } = useSession();
  const [state, setState] = useState<State>({ status: "loading" });
  const allowed = user ? canOpen(user.role, "/app/tasks") : false;

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    api
      .getTask(taskKey)
      .then((r) => !cancelled && setState({ status: "ready", task: r.task, assignees: r.assignees }))
      .catch((e) => !cancelled && setState({ status: "error", code: e instanceof api.ApiError ? e.code : "unavailable" }));
    return () => {
      cancelled = true;
    };
  }, [taskKey, allowed]);

  if (user && !allowed) return <NotForRole title="Tasks" />;
  if (state.status === "ready") return <LoadedTask initial={state.task} assignees={state.assignees} />;

  const missing = state.status === "error" && (state.code === "not_found" || state.code === "forbidden");
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-(--w-app) px-(--gutter) py-16">
      {state.status === "loading" ? (
        <p className="t-body text-fg-3" role="status">
          Opening the task…
        </p>
      ) : (
        <div className="grid max-w-(--w-read) justify-items-start gap-6">
          <h1 className="t-title text-fg-1">{missing ? "This task isn't on your list." : "This task can't be opened right now."}</h1>
          <p className="t-body text-fg-2">
            {missing ? "It may belong to another team, or it was deleted." : "Rosetta can't be reached right now. Try again in a minute."}
          </p>
          <Link href="/app/tasks" className={buttonStyles({ variant: "primary" })}>
            Back to tasks
          </Link>
        </div>
      )}
    </main>
  );
}

function LoadedTask({ initial, assignees }: { initial: TaskDetail; assignees: Person[] }) {
  const { user } = useSession();
  const router = useRouter();
  const [task, setTask] = useState(initial);
  const [live, setLive] = useState("");
  const client = user?.role === "client";
  const technical = user ? isTechnical(user.role) : false;
  // Only managers and the CMO decide what a client sees.
  const canShare = task.can.edit && (user ? isLead(user.role) : false);
  // The current assignee stays choosable even when they're outside the list.
  const people = task.assignee && !assignees.some((p) => p.id === task.assignee?.id) ? [task.assignee, ...assignees] : assignees;

  /** Shows the change at once; puts the old values back if it doesn't save. */
  const save = async (patch: api.TaskPatch, shown: Partial<TaskDetail>, said?: string) => {
    const before = task;
    const undo = Object.fromEntries(Object.keys(shown).map((k) => [k, before[k as keyof TaskDetail]])) as Partial<TaskDetail>;
    setTask((t) => ({ ...t, ...shown }));
    if (said) setLive(said);
    try {
      const { task: saved } = await api.updateTask(before.key, patch);
      setTask((t) => ({ ...saved, commits: t.commits }));
      return true;
    } catch (e) {
      setTask((t) => ({ ...t, ...undo }));
      toast(errorText(e, "That didn't save. Try again in a minute."));
      return false;
    }
  };

  const setStatus = (status: TaskStatus) =>
    save({ status }, { status, movedBy: "person", statusChangedAt: new Date().toISOString() }, `Moved to ${statusLabel(status)}.`);
  const setDue = (value: string) => {
    // Typing a date fires partial values; save only whole dates, or an empty box.
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    if (value === (task.dueDate ?? "")) return;
    void save({ dueDate: value || null }, { dueDate: value || null });
  };

  const due = dueText(task);
  const commits = [...task.commits].sort((a, b) => b.committedAt.localeCompare(a.committedAt));

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-(--w-app) px-(--gutter) pt-10 pb-24">
      <Link href="/app/tasks" className="t-small text-fg-3 hover:text-fg-1">
        Back to tasks
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 flex-1 basis-[28rem]">
          <p className="flex flex-wrap items-center gap-2">
            <span className="t-mono text-fg-3">{task.key}</span>
            <StatusPill status={task.status} />
            <PriorityTag priority={task.priority} />
            {task.sharedWithClient && !client && (
              <span className="inline-flex h-6 items-center rounded-xs bg-surface-2 px-2 t-micro text-fg-2">Shared with the client</span>
            )}
          </p>
          <Editable
            as="h1"
            value={task.title}
            editable={task.can.edit}
            label="Title"
            onCommit={(title) => void save({ title }, { title })}
            className="mt-3 t-title text-pretty break-words text-fg-1"
          />
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 t-small text-fg-3">
            {task.createdBy && (
              <>
                <span>Created by {task.createdBy.id === user?.id ? "you" : task.createdBy.name}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <time dateTime={task.createdAt}>{timeAgo(task.createdAt)}</time>
            {task.movedBy === "rosetta" && (
              <>
                <span aria-hidden>·</span>
                <span className="text-accent-ink">
                  Rosetta moved it to {statusLabel(task.status)} {timeAgo(task.statusChangedAt)}
                </span>
              </>
            )}
          </p>
        </div>
        {task.can.delete && <DeleteTask taskKey={task.key} title={task.title} onDeleted={() => router.push("/app/tasks")} />}
      </header>

      <p aria-live="polite" className="sr-only">
        {live}
      </p>

      <div className="mt-8 grid items-start gap-6 card:grid-cols-12">
        <div className="card:col-span-7">
          <Description task={task} onSave={(description) => save({ description }, { description })} />
        </div>

        <section aria-labelledby="details-heading" className="rounded-md bg-surface-1 p-6 shadow-elev-1 card:col-span-5 sm:p-8">
          <h2 id="details-heading" className="t-heading text-fg-1">
            Details
          </h2>
          <dl className="mt-5 grid gap-5">
            <Row label="Status" htmlFor={task.can.move ? "task-status" : undefined}>
              {task.can.move ? (
                <select id="task-status" value={task.status} onChange={(e) => void setStatus(e.target.value as TaskStatus)} className={cn(selectClass, "w-full")}>
                  {STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              ) : (
                <StatusPill status={task.status} />
              )}
            </Row>
            <Row label="Priority" htmlFor={task.can.edit ? "task-priority" : undefined}>
              {task.can.edit ? (
                <select
                  id="task-priority"
                  value={task.priority}
                  onChange={(e) => {
                    const priority = e.target.value as Priority;
                    void save({ priority }, { priority });
                  }}
                  className={cn(selectClass, "w-full")}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              ) : (
                <PriorityTag priority={task.priority} />
              )}
            </Row>
            <Row label="Assignee" htmlFor={task.can.assign ? "task-assignee" : undefined}>
              {task.can.assign ? (
                <select
                  id="task-assignee"
                  value={task.assignee?.id ?? ""}
                  onChange={(e) => {
                    const assignee = people.find((p) => p.id === e.target.value) ?? null;
                    void save({ assigneeId: assignee?.id ?? null }, { assignee }, assignee ? `Assigned to ${assignee.name}.` : "Unassigned.");
                  }}
                  className={cn(selectClass, "w-full")}
                >
                  <option value="">Nobody yet</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === user?.id ? `${p.name} (you)` : p.name}
                    </option>
                  ))}
                </select>
              ) : task.assignee ? (
                <span className="flex items-center gap-2">
                  <Avatar name={task.assignee.name} size={24} />
                  <PersonLine person={task.assignee} className="t-small text-fg-3" />
                </span>
              ) : (
                <span className="t-small text-fg-2">Nobody yet</span>
              )}
            </Row>
            <Row label="Due date" htmlFor={task.can.edit ? "task-due" : undefined}>
              {task.can.edit ? (
                <div className="flex items-center gap-2">
                  <input
                    id="task-due"
                    type="date"
                    defaultValue={task.dueDate ?? ""}
                    key={task.dueDate ?? ""}
                    onChange={(e) => setDue(e.target.value)}
                    aria-describedby={due ? "task-due-text" : undefined}
                    className={cn(selectClass, "w-full cursor-text pr-3")}
                  />
                  {task.dueDate && (
                    <Button variant="ghost" className="h-9! px-3!" onClick={() => setDue("")}>
                      Clear
                    </Button>
                  )}
                </div>
              ) : null}
              {due ? (
                <p id="task-due-text" className={cn("t-small", task.can.edit && "mt-1.5", isOverdue(task) ? "font-semibold text-(--risk-high)" : "text-fg-2")}>
                  {due}
                </p>
              ) : (
                !task.can.edit && <p className="t-small text-fg-2">No due date</p>
              )}
            </Row>
            {canShare ? (
              <div className="grid gap-1.5">
                <dt className="t-micro text-fg-3">Client</dt>
                <dd>
                  <label className="flex cursor-pointer items-start gap-3 t-small text-fg-1">
                    <input
                      type="checkbox"
                      checked={task.sharedWithClient}
                      onChange={(e) => {
                        const sharedWithClient = e.target.checked;
                        void save({ sharedWithClient }, { sharedWithClient }, sharedWithClient ? "Shared with the client." : "No longer shared with the client.");
                      }}
                      className="mt-0.5 size-5 shrink-0 cursor-pointer accent-(--btn-primary-bg)"
                    />
                    <span>
                      Share with the client
                      <span className="block t-micro text-fg-3">They see this task and its progress, written for them.</span>
                    </span>
                  </label>
                </dd>
              </div>
            ) : (
              !client && (
                <Row label="Client">
                  <p className="t-small text-fg-2">{task.sharedWithClient ? "Shared with the client" : "Not shared with the client"}</p>
                </Row>
              )
            )}
          </dl>
        </section>
      </div>

      <section aria-labelledby="done-heading" className="mt-12">
        <h2 id="done-heading" className="t-heading text-fg-1">
          What&rsquo;s been done
        </h2>
        {commits.length > 0 ? (
          <>
            <p className="mt-1 t-small text-fg-2">
              {commits.length === 1 ? "One linked commit" : `${commits.length} linked commits, newest first`}, explained for you.
            </p>
            <ul className="mt-4 grid grid-cols-1 gap-3">
              {commits.map((c) => (
                <CommitRow key={c.cardId} commit={c} technicalDetails={!client} />
              ))}
            </ul>
          </>
        ) : (
          <div className="mt-4 rounded-md p-8 shadow-ring">
            <p className="t-body text-fg-1">Nothing linked yet.</p>
            <p className="mt-2 max-w-[60ch] t-small text-pretty text-fg-2">
              {client ? (
                "Work on this task shows up here as it lands, explained for you."
              ) : technical ? (
                <>
                  Put <Key>{task.key}</Key> in a commit message, like <Key>{task.key}: rotate requests</Key>, and Rosetta links it here and moves the
                  task to In progress. Write <Key>fixes {task.key}</Key> in the last one; it moves to Done once you review the explanation.
                </>
              ) : (
                <>
                  When an engineer names <Key>{task.key}</Key> in a commit message, Rosetta links it here and explains what they did, for you.
                </>
              )}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <code className="rounded-xs bg-surface-2 px-1.5 py-0.5 t-code text-fg-1">{children}</code>;
}

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <dt className="t-micro text-fg-3">{htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Description({ task, onSave }: { task: TaskDetail; onSave: (description: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.description);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // A failed save keeps the box open with their text.
    const saved = await onSave(text.trim());
    setSaving(false);
    if (saved) setEditing(false);
  };

  return (
    <section aria-labelledby="description-heading" className="rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <h2 id="description-heading" className="t-heading text-fg-1">
          Description
        </h2>
        {task.can.edit && !editing && (
          <Button
            variant="ghost"
            className="-mr-3 h-8!"
            onClick={() => {
              setText(task.description);
              setEditing(true);
            }}
          >
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <form onSubmit={onSubmit} className="mt-4 grid gap-3">
          <label htmlFor="task-description" className="sr-only">
            Description
          </label>
          <textarea
            id="task-description"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs to happen, and why"
            autoFocus
            className="w-full resize-y rounded-sm bg-surface-2 px-3 py-2.5 t-body text-fg-1 shadow-ring-strong outline-none placeholder:text-fg-3 focus-visible:shadow-[0_0_0_2px_var(--focus)]"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={text.trim() === task.description}>
              Save
            </Button>
          </div>
        </form>
      ) : task.description ? (
        <p className="mt-4 max-w-[66ch] t-body whitespace-pre-line text-pretty text-fg-1">{task.description}</p>
      ) : (
        <p className="mt-4 t-small text-fg-3">No description yet.</p>
      )}
    </section>
  );
}

/** One linked commit, written at the reader's level, like a card in the feed. */
function CommitRow({ commit: c, technicalDetails }: { commit: TaskCommit; technicalDetails: boolean }) {
  return (
    <li>
      <Link
        href={`/app/c/${c.cardId}`}
        className="press block rounded-md bg-surface-1 p-5 shadow-elev-1 transition-[box-shadow,transform] duration-150 hover:shadow-elev-2 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="t-body font-semibold text-pretty text-fg-1">{c.title}</h3>
            <p className="mt-0.5 t-small text-fg-3">
              {c.authorName}
              <span aria-hidden> · </span>
              <time dateTime={c.committedAt}>{timeAgo(c.committedAt)}</time>
            </p>
          </div>
          <RiskBadge risk={c.risk} />
        </div>
        <p className="mt-4 max-w-[66ch] t-body text-pretty text-fg-2">{c.summary}</p>
        {c.impact && (
          <p className="mt-2 max-w-[66ch] t-small text-pretty text-fg-3">
            <span className="font-medium text-fg-2">What it changes: </span>
            {c.impact}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2 t-micro">
          {c.status === "approved" ? (
            <span className="inline-flex h-6 items-center rounded-xs bg-surface-2 px-2 text-fg-2">Reviewed by {firstName(c.authorName)}</span>
          ) : (
            <span className="inline-flex h-6 items-center rounded-xs bg-[color-mix(in_srgb,var(--risk-medium)_8%,transparent)] tone-pill px-2 text-(--risk-medium)">
              Not reviewed yet
            </span>
          )}
          {technicalDetails && (
            <span className="ml-auto font-mono text-fg-3">
              {c.repo.split("/")[1] ?? c.repo}@{c.ref}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

function DeleteTask({ taskKey, title, onDeleted }: { taskKey: string; title: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteTask(taskKey);
      setOpen(false);
      toast(`${taskKey} deleted.`);
      onDeleted();
    } catch (e) {
      toast(errorText(e, "That didn't delete. Try again in a minute."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="press inline-flex h-10 items-center gap-2 rounded-sm px-4 t-small font-medium text-(--ghost-fg) hover:bg-surface-2 hover:text-(--risk-high)">
        <TrashIcon /> Delete
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 z-50 bg-abyss/50" />
        <Dialog.Popup className="dialog-popup fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface-1 p-6 shadow-elev-3 outline-none sm:p-8">
          <Dialog.Title className="t-heading text-fg-1">Delete this task?</Dialog.Title>
          <Dialog.Description className="mt-2 t-small text-fg-2">
            {taskKey} &ldquo;{title}&rdquo; leaves the board for everyone. The commits stay; they just aren&rsquo;t linked to it any more.
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="press h-10 rounded-sm px-4 t-small font-medium text-fg-2 hover:bg-surface-2 hover:text-fg-1">Cancel</Dialog.Close>
            <Button variant="primary" loading={busy} onClick={remove} className="bg-(--risk-high)! text-canvas!">
              Delete this task
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
