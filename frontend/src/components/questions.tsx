"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { errorText } from "@/lib/errors";
import { isTechnical } from "@/lib/roles";
import { langFor } from "@/lib/lang";
import { useSession } from "@/lib/session";
import type { Member, TicketDetail, TicketSummary } from "@/lib/types";
import { cn, firstName, timeAgo } from "@/lib/utils";
import { LoadError, Page } from "./app-shell";
import { Button } from "./button";
import { ComposeQuestion } from "./compose-question";
import { Avatar, PersonLine } from "./person";

const STATUS: Record<TicketSummary["status"], { label: string; className: string }> = {
  open: { label: "Waiting for a reply", className: "bg-[color-mix(in_srgb,var(--risk-medium)_8%,transparent)] tone-pill text-(--risk-medium)" },
  answered: { label: "Answered", className: "bg-[color-mix(in_srgb,var(--risk-low)_8%,transparent)] tone-pill text-(--risk-low)" },
  closed: { label: "Closed", className: "bg-surface-2 text-fg-3" },
};

export function StatusChip({ status }: { status: TicketSummary["status"] }) {
  return <span className={cn("inline-flex h-6 shrink-0 items-center rounded-xs px-2 t-micro", STATUS[status].className)}>{STATUS[status].label}</span>;
}

/** Questions I was asked, and questions I asked. */
export function QuestionsList() {
  const { user } = useSession();
  const [data, setData] = useState<{ received: TicketSummary[]; sent: TicketSummary[] } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [composing, setComposing] = useState(false);
  const technical = user ? isTechnical(user.role) : false;
  const [tab, setTab] = useState<"received" | "sent">(technical ? "received" : "sent");
  const [failed, setFailed] = useState(false);

  const loadTickets = useCallback(() => {
    setFailed(false);
    api
      .getTickets()
      .then(setData)
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    loadTickets();
    api.getTeam().then((t) => setMembers(t.members)).catch(() => {});
  }, [loadTickets]);

  const messageable = useMemo(() => members.filter((m) => m.canMessage && m.status === "active"), [members]);
  const list = data?.[tab] ?? [];

  return (
    <Page
      title="Questions"
      lead={
        technical
          ? "What your manager and team asked you. Answer in your own words; they read it at their level."
          : "Ask anyone on your team directly. Replies arrive rewritten for you."
      }
      actions={
        messageable.length ? (
          <Button variant="primary" onClick={() => setComposing(true)}>
            New question
          </Button>
        ) : null
      }
    >
      <div role="group" aria-label="Show questions" className="inline-grid grid-cols-2 rounded-sm bg-surface-2 p-1 shadow-ring">
        {(["received", "sent"] as const).map((t) => {
          const count = data?.[t].filter((x) => x.unread).length ?? 0;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "press inline-flex h-9 items-center gap-2 rounded-full px-4 t-small font-medium",
                tab === t ? "bg-surface-1 text-fg-1 shadow-elev-1" : "text-fg-2 hover:text-fg-1",
              )}
            >
              {t === "received" ? "Asked of me" : "I asked"}
              {count > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 t-micro font-semibold text-accent-fg">
                  {count}
                  <span className="sr-only"> unread</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {failed && !data ? (
          <LoadError message="Your questions can't load right now." onRetry={loadTickets} />
        ) : !data ? (
          <p className="t-body text-fg-3">Loading…</p>
        ) : list.length === 0 ? (
          <div className="rounded-md p-8 shadow-ring">
            <p className="t-body font-medium text-fg-1">{tab === "received" ? "Nobody has asked you anything yet." : "You haven't asked anything yet."}</p>
            <p className="mt-1 t-small text-fg-2">
              {tab === "received" ? "Questions about your changes show up here." : "Use New question, or select a box in any flowchart and ask why."}
            </p>
          </div>
        ) : (
          <ul className="grid gap-2">
            {list.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/app/questions/${t.id}`}
                  className="press flex items-start gap-4 rounded-md bg-surface-1 p-5 shadow-elev-1 transition-[box-shadow] duration-150 hover:shadow-elev-2"
                >
                  <Avatar name={t.other?.name ?? "Former member"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {t.kind === "report" && (
                        <span className="inline-flex h-6 items-center rounded-xs bg-[color-mix(in_srgb,var(--risk-high)_8%,transparent)] tone-pill px-2 t-micro text-(--risk-high)">
                          Reported mistake
                        </span>
                      )}
                      <span className="t-body font-semibold text-fg-1">{t.subject}</span>
                      {t.unread && <span className="size-2 rounded-full bg-accent" aria-label="Unread" />}
                    </div>
                    <p className="mt-0.5 t-small text-fg-3">
                      {tab === "received" ? "From " : "To "}
                      <PersonLine person={t.other} className="text-fg-3" /> · {timeAgo(t.updatedAt)}
                    </p>
                    <p className="mt-2 line-clamp-2 t-small text-fg-2">{t.preview}</p>
                    {t.context && <p className="mt-2 t-micro text-fg-3">About &ldquo;{t.context.cardTitle}&rdquo;</p>}
                  </div>
                  <StatusChip status={t.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ComposeQuestion open={composing} onOpenChange={setComposing} people={messageable} />
    </Page>
  );
}

/** One conversation. */
export function QuestionThread({ id }: { id: string }) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [failed, setFailed] = useState<"missing" | "error" | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);
  const { user } = useSession();
  const [original, setOriginal] = useState<Set<string>>(new Set());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setFailed(null);
    api
      .getTicket(id)
      .then((r) => current && setTicket(r.ticket))
      .catch((e) => {
        if (!current) return;
        const missing = e instanceof api.ApiError && (e.code === "not_found" || e.code === "forbidden");
        setFailed(missing ? "missing" : "error");
      });
    return () => {
      current = false;
    };
  }, [id, attempt]);

  // Replies arrive without a reload: check every 20 s while the tab is visible, and on return to it.
  useEffect(() => {
    let current = true;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      api
        .getTicket(id)
        .then((r) => current && setTicket(r.ticket))
        .catch(() => {});
    };
    const timer = window.setInterval(refresh, 20_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [id]);

  if (failed === "error" && !ticket) {
    return (
      <Page title="Question">
        <LoadError message="This question can't load right now." onRetry={() => setAttempt((n) => n + 1)} />
      </Page>
    );
  }
  if (failed === "missing") {
    return (
      <Page title="This question isn't available.">
        <Link href="/app/questions" className="t-body text-fg-1 underline underline-offset-4">
          Back to questions
        </Link>
      </Page>
    );
  }
  if (!ticket) return <Page title="Question">{<p className="t-body text-fg-3">Loading…</p>}</Page>;

  const answering = ticket.direction === "received";
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      setTicket((await api.replyTicket(ticket.id, text.trim())).ticket);
      setText("");
    } catch (e) {
      toast(errorText(e, "That reply didn't send. Try again in a minute."));
    } finally {
      setSending(false);
    }
  };
  const toggle = async () => {
    setToggling(true);
    try {
      setTicket((await api.setTicketStatus(ticket.id, ticket.status === "closed" ? "open" : "closed")).ticket);
    } catch (e) {
      toast(errorText(e, ticket.status === "closed" ? "Couldn't reopen it. Try again in a minute." : "Couldn't close it. Try again in a minute."));
    } finally {
      setToggling(false);
    }
  };

  return (
    <Page
      title={ticket.subject}
      lead={
        <>
          {answering ? "Asked by " : "Asked to "}
          <PersonLine person={ticket.other} className="text-fg-2" />
        </>
      }
      actions={
        <>
          <StatusChip status={ticket.status} />
          <Button variant="ghost" onClick={toggle} loading={toggling}>
            {ticket.status === "closed" ? "Reopen" : "Close question"}
          </Button>
        </>
      }
    >
      <div className="grid max-w-[46rem] gap-6">
        {ticket.context && (
          <div className="rounded-md bg-surface-1 p-5 shadow-elev-1">
            <p className="t-small text-fg-3">About a step in</p>
            <Link href={`/app/c/${ticket.context.cardId}`} className="mt-1 block t-body font-semibold text-fg-1 underline-offset-4 hover:underline">
              {ticket.context.cardTitle}
            </Link>
            {ticket.stepLabel && <p className="mt-1 t-small text-fg-2">Step: {ticket.stepLabel}</p>}
            {ticket.context.technicalQuestion && (
              <div className="mt-4 rounded-sm bg-surface-2 px-4 py-3">
                <p className="t-micro text-fg-3">Rosetta&rsquo;s technical version for you</p>
                <p className="mt-1 t-small text-fg-1">{ticket.context.technicalQuestion}</p>
              </div>
            )}
          </div>
        )}

        <ol className="grid gap-4">
          {ticket.messages.map((m) => {
            const showOriginal = original.has(m.id);
            return (
              <li key={m.id} className={cn("flex gap-3", m.mine && "flex-row-reverse")}>
                <Avatar name={m.author?.name ?? "Former member"} size={32} lead={m.mine} />
                <div className={cn("grid max-w-[36rem] gap-1", m.mine && "justify-items-end")}>
                  <p className="t-micro text-fg-3">
                    {m.mine ? "You" : m.author ? firstName(m.author.name) : "Former member"} · {timeAgo(m.createdAt)}
                  </p>
                  <p
                    lang={langFor(user?.language, m.translated && !showOriginal)}
                    className={cn(
                      "rounded-md px-4 py-3 t-body text-fg-1",
                      m.mine ? "rounded-tr-xs bg-surface-2" : "rounded-tl-xs bg-surface-1 shadow-elev-1",
                    )}
                  >
                    {showOriginal ? m.original : m.text}
                  </p>
                  {m.translated && (
                    <button
                      type="button"
                      onClick={() =>
                        setOriginal((s) => {
                          const next = new Set(s);
                          if (next.has(m.id)) next.delete(m.id);
                          else next.add(m.id);
                          return next;
                        })
                      }
                      className="t-micro text-fg-3 underline underline-offset-4 hover:text-fg-1"
                    >
                      {showOriginal ? "Show it for me" : `Show what ${firstName(m.author?.name ?? "they")} wrote`}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {ticket.status !== "closed" && (
          <form onSubmit={onSubmit} className="grid gap-2 rounded-md bg-surface-1 p-5 shadow-elev-1">
            <label htmlFor="reply" className="t-small font-medium text-fg-1">
              {answering ? "Your answer" : "Follow up"}
            </label>
            <textarea
              id="reply"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={answering ? "Write it the way you'd tell a teammate. Rosetta rewrites it for them." : "Ask a follow-up"}
              className="w-full resize-none rounded-sm bg-surface-2 px-3 py-2.5 t-body text-fg-1 shadow-ring-strong outline-none placeholder:text-fg-3 focus-visible:shadow-[0_0_0_2px_var(--focus)]"
            />
            <Button type="submit" variant="primary" loading={sending} disabled={!text.trim()} className="justify-self-end">
              {answering ? "Send answer" : "Send"}
            </Button>
          </form>
        )}
      </div>
    </Page>
  );
}
