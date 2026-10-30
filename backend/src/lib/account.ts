import type { Notification } from "./notify";
import type { Reset } from "./resets";
import { store } from "./store";
import type { Comment, Org, StoredCard, StoredUser, Ticket, User } from "./types";

/**
 * Removing people and whole workspaces. What happens is described word for
 * word in the Privacy Policy (frontend/src/app/privacy), so change both together.
 *
 * When someone leaves (they delete their account, or the owner removes them):
 * - their account, password hash, invite, notifications, reset links and personal notes are deleted;
 * - their comments and question messages stay for the team, but are shown as written by "Former member";
 * - changes they wrote stay in the workspace, with the author shown as "Former member"
 *   (nobody can mark those reviewed any more);
 * - people who reported to them now report to their manager (or the owner). A client
 *   who ends up under a CMO or the owner sees no changes until they're moved to a manager.
 */

/** Stands in for a deleted person wherever their content stays. */
export const FORMER_MEMBER = "former-member";

/** Whoever takes over someone's direct reports: the person above them, or the owner. */
export const heirOf = (member: User, org: Org) => member.managerId ?? org.ownerId;

export async function moveReports(from: User, to: string, users: StoredUser[], now: string) {
  for (const u of users.filter((x) => x.managerId === from.id)) {
    // Re-read, so a password change made meanwhile (new hash, session version) isn't undone.
    const latest = await store.get<StoredUser>("users", u.id);
    if (latest) await store.set("users", u.id, { ...latest, managerId: to, updatedAt: now });
  }
}

export async function removeMember(org: Org, member: StoredUser, users: StoredUser[]) {
  const now = new Date().toISOString();
  const heir = heirOf(member, org);
  await moveReports(member, heir, users, now);

  const [cards, comments, tickets, notes, resets] = await Promise.all([
    store.list<StoredCard>("cards", "orgId", org.id),
    store.list<Comment>("comments", "orgId", org.id),
    store.list<Ticket>("tickets", "orgId", org.id),
    store.list<Notification>("notifications", "userId", member.id),
    store.list<Reset & { id?: string }>("resets", "userId", member.id),
  ]);

  // Their changes stay visible to the team they were in, without their name. The
  // author becomes FORMER_MEMBER, so nobody (not the heir, not whoever pasted the
  // link) can review it as if they wrote it; whoever explained it keeps seeing it.
  for (const c of cards.filter((k) => k.authorUserId === member.id || k.createdBy === member.id)) {
    const authored = c.authorUserId === member.id;
    await store.set<StoredCard>("cards", c.id, {
      ...c,
      authorUserId: authored || !c.authorUserId ? FORMER_MEMBER : c.authorUserId,
      // A synced change has no creator: the heir becomes it so the team keeps seeing it (not reviewing it).
      createdBy: c.createdBy === member.id || (authored && !c.createdBy) ? heir : c.createdBy,
      author: authored ? { name: "Former member", login: "" } : c.author,
    });
  }
  // Personal notes are cached per reader and change, on any change they read.
  for (const c of cards) await store.remove("notes", `${c.id}_${member.id}`);
  for (const c of comments.filter((k) => k.authorId === member.id)) {
    await store.set<Comment>("comments", c.id, { ...c, authorId: FORMER_MEMBER });
  }
  for (const t of tickets.filter((k) => k.fromId === member.id || k.toId === member.id || k.messages.some((m) => m.authorId === member.id))) {
    await store.set<Ticket>("tickets", t.id, {
      ...t,
      fromId: t.fromId === member.id ? FORMER_MEMBER : t.fromId,
      toId: t.toId === member.id ? FORMER_MEMBER : t.toId,
      messages: t.messages.map((m) => (m.authorId === member.id ? { ...m, authorId: FORMER_MEMBER } : m)),
      unreadBy: t.unreadBy.filter((u) => u !== member.id),
    });
  }
  await Promise.all([
    ...notes.map((n) => store.remove("notifications", n.id)),
    // Reset documents are keyed by a hash of the token, so find them by user.
    ...resets.map((r) => (r.id ? store.remove("resets", r.id) : Promise.resolve())),
  ]);
  // Loaded here: tasks reads the org rules, which read this file.
  const { releaseMember } = await import("./tasks");
  await releaseMember(org.id, member.id, heir);
  if (member.inviteCode) await store.remove("invites", member.inviteCode);
  await store.remove("users", member.id);
}

/** Deletes a workspace and everything in it, including every member's account. */
export async function deleteWorkspace(org: Org) {
  const collections = ["users", "cards", "comments", "tickets", "notifications", "jobs", "graphs", "graph_chunks", "tasks"] as const;
  const docs = await Promise.all(collections.map((c) => store.list<{ id: string; inviteCode?: string }>(c, "orgId", org.id)));
  const [users, cards] = docs;
  // Tombstones for changes the workspace deleted. Older ones don't record their id (the card id), so they stay.
  for (const d of await store.list<{ id?: string }>("deleted", "orgId", org.id)) {
    if (d.id) await store.remove("deleted", d.id);
  }
  for (const u of users as StoredUser[]) {
    if (u.inviteCode) await store.remove("invites", u.inviteCode);
    for (const c of cards) await store.remove("notes", `${c.id}_${u.id}`);
    // Left behind, a reset link could set the password of a later account with the same email.
    for (const r of await store.list<Reset & { id?: string }>("resets", "userId", u.id)) {
      if (r.id) await store.remove("resets", r.id);
    }
  }
  for (const [i, list] of docs.entries()) for (const d of list) await store.remove(collections[i], d.id);
  await store.remove("orgs", org.id);
}
