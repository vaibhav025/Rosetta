"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiError, createTicket } from "@/lib/api";
import { roleLabel } from "@/lib/roles";
import type { Person } from "@/lib/types";
import { firstName } from "@/lib/utils";
import { Button } from "./button";
import { inputClass } from "./form";
import { CloseIcon } from "./icons";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** People this person may message. */
  people: Person[];
  toId?: string;
  subject?: string;
  text?: string;
  context?: { cardId: string; nodeKey: string; technicalQuestion?: string };
};

/** Ask someone a question directly, e.g. "Are you working on something for the release?" */
export function ComposeQuestion({ open, onOpenChange, people, toId, subject = "", text = "", context }: Props) {
  const router = useRouter();
  const [to, setTo] = useState(toId ?? "");
  const [title, setTitle] = useState(subject);
  const [body, setBody] = useState(text);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTo(toId ?? people[0]?.id ?? "");
    setTitle(subject);
    setBody(text);
    setError(null);
  }, [open, toId, subject, text, people]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!to || !title.trim() || !body.trim()) {
      setError("Choose who to ask, and write a subject and a question.");
      return;
    }
    setSending(true);
    try {
      const { ticket } = await createTicket({ toId: to, subject: title.trim(), text: body.trim(), context });
      const name = people.find((p) => p.id === to)?.name ?? "them";
      toast(`Sent to ${firstName(name)}.`);
      onOpenChange(false);
      router.push(`/app/questions/${ticket.id}`);
    } catch (err) {
      setError(err instanceof ApiError && err.detail ? err.detail : "That didn't send. Try again in a minute.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 z-50 bg-abyss/50" />
        <Dialog.Popup className="dialog-popup fixed top-1/2 left-1/2 z-50 w-[min(34rem,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface-1 p-6 shadow-elev-3 outline-none sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="t-heading text-fg-1">Ask a question</Dialog.Title>
              <Dialog.Description className="mt-1 t-small text-fg-2">
                They&rsquo;ll see it in Questions, and you&rsquo;ll read the reply at your level.
              </Dialog.Description>
            </div>
            <Dialog.Close className="press -mt-1 -mr-2 grid size-10 place-items-center rounded-sm text-fg-2 hover:bg-surface-2" aria-label="Close">
              <CloseIcon className="ico" />
            </Dialog.Close>
          </div>

          <form onSubmit={onSubmit} className="mt-6 grid gap-4">
            <label className="grid gap-2">
              <span className="t-small font-medium text-fg-1">To</span>
              <select value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} disabled={Boolean(toId)}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.title || roleLabel(p.role)}
                    {p.team ? ` · ${p.team.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="t-small font-medium text-fg-1">Subject</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Checkout release" maxLength={120} />
            </label>
            <label className="grid gap-2">
              <span className="t-small font-medium text-fg-1">Question</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder="Are you working on anything for Friday's release?"
                className={`${inputClass} h-auto resize-none py-2.5`}
              />
            </label>
            {error && (
              <p role="alert" className="t-small font-medium text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Dialog.Close className="press inline-flex h-10 items-center rounded-sm px-4 t-small font-medium text-(--ghost-fg) hover:bg-surface-2">
                Cancel
              </Dialog.Close>
              <Button type="submit" variant="primary" loading={sending}>
                Send question
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
