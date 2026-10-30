import { randomUUID } from "node:crypto";
import { store } from "./store";

/**
 * In-app notifications: the bell in the top bar. Written alongside the
 * emails, so people who don't check email still see what happened.
 */

export type NotificationKind = "question" | "reply" | "report" | "change" | "reviewed" | "joined" | "task";

export type Notification = {
  id: string;
  orgId: string;
  userId: string;
  kind: NotificationKind;
  /** One line, e.g. "Neha asked: Are you working on something?" */
  title: string;
  /** Where clicking it goes, inside the app. */
  href: string;
  read: boolean;
  createdAt: string;
};

/** Best effort: a failed notification never fails the action that caused it. */
export async function notify(n: Omit<Notification, "id" | "read" | "createdAt">) {
  try {
    const id = `n_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    await store.set<Notification>("notifications", id, { ...n, id, read: false, createdAt: new Date().toISOString() });
  } catch (error) {
    console.warn("[rosetta] notify failed:", error instanceof Error ? error.message : error);
  }
}

const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const notifications = {
  question: (o: { orgId: string; to: string; fromName: string; subject: string; ticketId: string }) =>
    notify({ orgId: o.orgId, userId: o.to, kind: "question", title: `${o.fromName} asked: ${clip(o.subject)}`, href: `/app/questions/${o.ticketId}` }),
  report: (o: { orgId: string; to: string; fromName: string; title: string; ticketId: string }) =>
    notify({ orgId: o.orgId, userId: o.to, kind: "report", title: `${o.fromName} reported a possible mistake in “${clip(o.title, 60)}”`, href: `/app/questions/${o.ticketId}` }),
  reply: (o: { orgId: string; to: string; fromName: string; subject: string; ticketId: string }) =>
    notify({ orgId: o.orgId, userId: o.to, kind: "reply", title: `${o.fromName} replied: ${clip(o.subject)}`, href: `/app/questions/${o.ticketId}` }),
  change: (o: { orgId: string; to: string; authorName: string; title: string; cardId: string }) =>
    notify({ orgId: o.orgId, userId: o.to, kind: "change", title: `New from ${o.authorName}: ${clip(o.title, 70)}`, href: `/app/c/${o.cardId}` }),
  /** To the engineer whose push was explained by itself. Kind "change", so existing bells show it. */
  explained: (o: { orgId: string; to: string; repo: string; cardId: string }) =>
    notify({ orgId: o.orgId, userId: o.to, kind: "change", title: `Your push to ${o.repo} was explained — review it`, href: `/app/c/${o.cardId}` }),
  reviewed: (o: { orgId: string; to: string; authorName: string; title: string; cardId: string }) =>
    notify({ orgId: o.orgId, userId: o.to, kind: "reviewed", title: `${o.authorName} reviewed “${clip(o.title, 60)}”`, href: `/app/c/${o.cardId}` }),
  joined: (o: { orgId: string; to: string; name: string }) =>
    notify({ orgId: o.orgId, userId: o.to, kind: "joined", title: `${o.name} joined your team`, href: "/app/team" }),
};
