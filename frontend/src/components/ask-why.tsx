"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Drawer } from "vaul";
import { toast } from "sonner";
import { ApiError, ask, createTicket, reportMistake } from "@/lib/api";
import { errorText } from "@/lib/errors";
import type { LevelKey } from "@/lib/levels";
import { isLead, isTechnical } from "@/lib/roles";
import type { CardView, Evidence, Person } from "@/lib/types";
import { useMediaQuery } from "@/lib/use-media-query";
import { firstName } from "@/lib/utils";
import { Button } from "./button";
import type { AskTarget } from "./flowchart";
import { AiNotice } from "./ai-notice";
import { EvidenceSnippet } from "./evidence";
import { CloseIcon } from "./icons";

type Thread =
  | { step: "asking"; question: string }
  | { step: "answered"; question: string; answer: string }
  | { step: "confirm"; question: string; technicalQuestion: string; askTo: Person | null; sending?: boolean }
  | { step: "sent"; question: string; ticketId: string; to: string }
  | { step: "error"; question: string; message: string };

const keyOf = (t: AskTarget) => `${t.panel}:${t.nodeId}`;

type Props = {
  card: CardView;
  target: AskTarget | null;
  open: boolean;
  onClose: () => void;
  /** The level being read; a reviewer can preview the others. */
  levelKey?: LevelKey;
};

/** Ask why a step works the way it does. Code answers first; the engineer answers the rest. */
export function AskWhy({ card, target, open, onClose, levelKey = card.viewer.level }: Props) {
  const title = card.viewer.canAsk ? "Ask why" : "Behind this step";
  const desktop = useMediaQuery("(min-width: 768px)", true);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const titleId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const content = target && (
    <AskContent
      key={keyOf(target)}
      card={card}
      levelKey={levelKey}
      target={target}
      thread={threads[keyOf(target)]}
      setThread={(t) =>
        setThreads((all) => {
          const next = { ...all };
          if (t) next[keyOf(target)] = t;
          else delete next[keyOf(target)];
          return next;
        })
      }
      inputRef={inputRef}
    />
  );

  if (!desktop) {
    return (
      <Drawer.Root open={open} onOpenChange={(next) => !next && onClose()}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-abyss/40" />
          <Drawer.Content
            aria-describedby={undefined}
            className="glass glass-thick fixed inset-x-0 bottom-0 z-50 flex max-h-[85svh] flex-col rounded-t-lg pb-[env(safe-area-inset-bottom)] outline-none"
          >
            <div aria-hidden className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-(--ring-strong)" />
            <Drawer.Title className="px-6 pt-4 t-heading text-fg-1">{title}</Drawer.Title>
            <div className="overflow-y-auto px-6 pt-4 pb-6">{content}</div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} titleId={titleId} inputRef={inputRef} title={title}>
      {content}
    </Sheet>
  );
}

function Sheet({
  open,
  onClose,
  titleId,
  inputRef,
  title,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  titleId: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  children: ReactNode;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    if (!open) {
      root.removeAttribute("data-sheet-open");
      returnFocus.current?.focus({ preventScroll: true });
      returnFocus.current = null;
      return;
    }
    root.setAttribute("data-sheet-open", "");
    returnFocus.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, inputRef]);

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-open={open}
      inert={!open}
      className="sheet glass glass-thick fixed top-[calc(var(--nav-h)+8px)] right-0 bottom-2 z-50 flex w-[420px] max-w-[calc(100vw-16px)] flex-col rounded-l-lg"
    >
      <div className="flex items-center justify-between gap-4 py-4 pr-4 pl-6">
        <h2 id={titleId} className="t-heading text-fg-1">
          {title}
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <CloseIcon className="ico" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>
    </aside>
  );
}

/** Three dots that bounce in turn while an answer is on its way. */
function TypingDots() {
  return (
    <span aria-hidden className="typing-dots">
      <span />
      <span />
      <span />
    </span>
  );
}

/** Ready questions that fit the reader: technical readers ask how, everyone else asks what it means for them. */
const suggestionsFor = (level: LevelKey) =>
  isTechnical(level)
    ? ["Why was this needed?", "What could break because of this?"]
    : level === "client"
      ? ["Why was this needed?", "What will I notice?"]
      : ["Why was this needed?", "Will this delay the launch?"];

function AskContent({
  card,
  levelKey,
  target,
  thread,
  setThread,
  inputRef,
}: {
  card: CardView;
  levelKey: LevelKey;
  target: AskTarget;
  thread: Thread | undefined;
  setThread: (thread: Thread | undefined) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [question, setQuestion] = useState("");
  const level = card.explanation.levels[levelKey];
  const evidence = card.explanation.evidence?.[target.key];
  const technical = isTechnical(card.viewer.level) || card.viewer.canReview;
  const stepLabel = level?.labels[target.key] ?? target.key;

  const submit = async (text: string) => {
    const q = text.trim();
    if (!q || thread?.step === "asking") return;
    setThread({ step: "asking", question: q });
    try {
      const result = await ask({ cardId: card.id, nodeKey: target.key, question: q });
      setThread(
        result.answerable
          ? { step: "answered", question: q, answer: result.answer }
          : { step: "confirm", question: q, technicalQuestion: result.technicalQuestion, askTo: result.askTo },
      );
      setQuestion("");
    } catch (error) {
      setThread({
        step: "error",
        question: q,
        message:
          error instanceof ApiError && error.code === "unavailable" && !error.detail
            ? "Rosetta can't answer questions right now. Try again in a minute."
            : errorText(error, "That didn't work. Try again in a minute."),
      });
    }
  };

  const send = async () => {
    if (thread?.step !== "confirm" || !thread.askTo || thread.sending) return;
    setThread({ ...thread, sending: true });
    try {
      const { ticket } = await createTicket({
        toId: thread.askTo.id,
        subject: `About “${card.explanation.title}”`,
        text: thread.question,
        context: { cardId: card.id, nodeKey: target.key, technicalQuestion: thread.technicalQuestion },
      });
      setThread({ step: "sent", question: thread.question, ticketId: ticket.id, to: thread.askTo.name });
    } catch (error) {
      setThread({ step: "error", question: thread.question, message: errorText(error, "That didn't send. Try again in a minute.") });
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(question);
  };

  return (
    <div className="grid gap-6">
      <div>
        <p className="t-small text-fg-2">{card.viewer.canAsk ? "Asking about" : "Step"}</p>
        <p className="mt-1 t-heading text-fg-1">{stepLabel}</p>
      </div>

      <Proof evidence={evidence} technical={technical} isSample={card.source === "demo"} />

      {card.viewer.canAsk && (
        <>
      <form onSubmit={onSubmit} className="grid gap-3">
        <label htmlFor={`ask-${target.nodeId}`} className="t-small font-medium text-fg-1">
          Your question
        </label>
        <textarea
          id={`ask-${target.nodeId}`}
          ref={inputRef}
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit(question);
            }
          }}
          placeholder={`Why does “${stepLabel}” work this way?`}
          className="w-full resize-none rounded-sm bg-surface-1 px-3 py-2.5 t-body text-fg-1 shadow-ring-strong outline-none placeholder:text-fg-3 focus-visible:shadow-[0_0_0_2px_var(--focus)]"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {[...(card.suggestedQuestion ? [card.suggestedQuestion] : []), ...suggestionsFor(card.viewer.level)].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuestion(s);
                  void submit(s);
                }}
                className="press min-h-8 rounded-xs bg-surface-2 px-3 py-1 text-left t-small font-medium text-fg-1 hover:bg-(--surface-3) pointer-coarse:min-h-11"
              >
                {s}
              </button>
            ))}
          </div>
          <Button type="submit" variant={thread?.step === "confirm" ? "secondary" : "primary"} loading={thread?.step === "asking"} disabled={!question.trim()}>
            Ask
          </Button>
        </div>
        <AiNotice />
      </form>

      <div aria-live="polite" className="grid gap-4">
        {thread && thread.step !== "asking" && (
          <p className="t-small text-fg-2">
            You asked: <span className="text-fg-1">{thread.question}</span>
          </p>
        )}
        {thread?.step === "asking" && (
          <p className="flex items-center gap-2 t-small font-medium text-fg-1">
            <TypingDots /> Reading the code
          </p>
        )}
        {thread?.step === "answered" && (
          <div className="grid gap-2">
            <p className="t-body font-medium text-fg-1">{thread.answer}</p>
            <p className="t-small text-fg-2">Answered from the code in this change.</p>
          </div>
        )}
        {thread?.step === "confirm" &&
          (thread.askTo ? (
            <div className="grid gap-3">
              <p className="t-body font-medium text-fg-1">
                The code can&rsquo;t answer this. Send it to {firstName(thread.askTo.name)}, who wrote the change?
              </p>
              <p className="t-small text-fg-2">
                {firstName(thread.askTo.name)} gets your words plus a technical version, and you&rsquo;ll read the reply in Questions.
              </p>
              <div className="flex gap-2">
                <Button variant="primary" onClick={send} loading={thread.sending}>
                  Ask {firstName(thread.askTo.name)}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQuestion(thread.question);
                    setThread(undefined);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <p className="t-body font-medium text-fg-1">
                The code can&rsquo;t answer this, and {card.author.name ? firstName(card.author.name) : "the person who wrote it"} isn&rsquo;t in your
                workspace yet.
              </p>
              <p className="t-small text-fg-2">
                {isLead(card.viewer.level) ? "Add them on the team page" : "Ask your manager to add them on the team page"} with their GitHub
                username{card.author.login ? <span className="font-mono"> @{card.author.login}</span> : null}. Until then, you can ask
                someone on your team from Questions.
              </p>
            </div>
          ))}
        {thread?.step === "sent" && (
          <div className="grid gap-2">
            <p className="t-body font-medium text-fg-1">Sent to {firstName(thread.to)}. You&rsquo;ll see the reply in Questions.</p>
            <Link href={`/app/questions/${thread.ticketId}`} className="t-small font-medium text-fg-1 underline underline-offset-4">
              Open the conversation
            </Link>
          </div>
        )}
        {thread?.step === "error" && (
          <div className="grid gap-3">
            <p className="t-body font-medium text-fg-1">{thread.message}</p>
            <Button className="justify-self-start" onClick={() => submit(thread.question)}>
              Try again
            </Button>
          </div>
        )}
      </div>

      <ReportMistake card={card} nodeKey={target.key} />
        </>
      )}
    </div>
  );
}

/** The code behind the step. People who don't read code open it if they want proof. */
function Proof({ evidence, technical, isSample }: { evidence?: Evidence; technical: boolean; isSample: boolean }) {
  if (!evidence) {
    return technical ? (
      <p className="t-small text-fg-3">No single place in the diff matches this step{isSample ? "" : ", so check it against the change yourself"}.</p>
    ) : null;
  }
  if (technical) {
    return (
      <div className="grid gap-2">
        <p className="t-small text-fg-2">The code behind this step</p>
        <EvidenceSnippet evidence={evidence} />
      </div>
    );
  }
  return (
    <details className="rounded-sm bg-surface-2 p-3">
      <summary className="cursor-pointer t-small font-medium text-fg-1">See the code behind this step</summary>
      <p className="mt-2 t-micro text-fg-3">You don&rsquo;t need to read it. It&rsquo;s here so anyone can check this box against the real change.</p>
      <div className="mt-3">
        <EvidenceSnippet evidence={evidence} />
      </div>
    </details>
  );
}

/** "This step looks wrong": goes straight to the engineer who wrote the change. */
export function ReportMistake({ card, nodeKey, label = "This step looks wrong" }: { card: CardView; nodeKey?: string; label?: string }) {
  const [state, setState] = useState<"idle" | "writing" | "sending" | "sent">("idle");
  const [text, setText] = useState("");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const author = card.authorPerson;
  if (!author) return null;

  if (state === "sent") {
    return (
      <p className="t-small text-fg-2">
        Thanks. {firstName(author.name)} will check it.{" "}
        {ticketId && (
          <Link href={`/app/questions/${ticketId}`} className="font-medium text-fg-1 underline underline-offset-4">
            Follow it in Questions
          </Link>
        )}
      </p>
    );
  }
  if (state === "idle") {
    return (
      <button type="button" onClick={() => setState("writing")} className="justify-self-start t-small text-fg-3 underline underline-offset-4 hover:text-fg-1">
        {label}
      </button>
    );
  }
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 3) return;
    setState("sending");
    try {
      const { ticket } = await reportMistake(card.id, { text: text.trim(), nodeKey });
      setTicketId(ticket.id);
      setState("sent");
    } catch (error) {
      setState("writing");
      toast(errorText(error, "That didn't send. Try again in a minute."));
    }
  };
  return (
    <form onSubmit={send} className="grid gap-2 border-t border-(--ring) pt-4">
      <label htmlFor={`report-${nodeKey ?? "card"}`} className="t-small font-medium text-fg-1">
        What looks wrong? {firstName(author.name)} gets it{nodeKey ? " with this step attached" : ""}.
      </label>
      <textarea
        id={`report-${nodeKey ?? "card"}`}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. We never retry card declines, only network errors."
        className="w-full resize-none rounded-sm bg-surface-1 px-3 py-2.5 t-body text-fg-1 shadow-ring-strong outline-none placeholder:text-fg-3 focus-visible:shadow-[0_0_0_2px_var(--focus)]"
      />
      <div className="flex gap-2">
        <Button type="submit" loading={state === "sending"} disabled={text.trim().length < 3}>
          Send to {firstName(author.name)}
        </Button>
        <Button variant="ghost" onClick={() => setState("idle")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
