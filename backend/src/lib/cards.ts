import { createHash } from "node:crypto";
import { isPitchCommit } from "./demo/pitch";
import { PITCH_QUESTION } from "./demo/pitch-script";
import { z } from "zod";
import { SAMPLES } from "./demo/samples";
import type { ParsedLink } from "./github-url";
import { LEVELS } from "./levels";
import { canReview, isTechnical, personOf } from "./org";
import { store } from "./store";
import type { Card, Explanation, StoredCard, User } from "./types";

/** One card per commit per workspace, so a commit is only explained once. */
export function cardIdFor(orgId: string, link: ParsedLink) {
  const ref = link.kind === "commit" ? link.sha.slice(0, 7) : `pull-${link.number}`;
  const key = `${orgId}:${link.owner}/${link.repo}@${ref}`.toLowerCase();
  return `c_${createHash("sha256").update(key).digest("hex").slice(0, 14)}`;
}

/** Two commit SHAs (full or abbreviated) that name the same commit. */
const sameSha = (a: string, b: string) => {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  return x.startsWith(y) || y.startsWith(x);
};

/**
 * The card id for a new explanation. Usually `cardIdFor`; but when two commits
 * in one repo share their first 7 characters, the later one gets an id from its
 * full SHA, so it never overwrites the earlier card (whose id stays the same).
 */
export async function resolveCardId(orgId: string, link: ParsedLink) {
  const id = cardIdFor(orgId, link);
  if (link.kind !== "commit" || link.sha.length <= 7) return id;
  const existing = await store.get<StoredCard>("cards", id);
  if (!existing || sameSha(existing.headSha, link.sha)) return id;
  const key = `${orgId}:${link.owner}/${link.repo}@${link.sha}`.toLowerCase();
  return `c_${createHash("sha256").update(key).digest("hex").slice(0, 20)}`;
}

/** Pre-written explanations for the demo commits. */
export function demoSampleFor(repo: string, sha: string) {
  return SAMPLES.find((s) => s.card.repo.toLowerCase() === repo.toLowerCase() && s.sha.startsWith(sha.toLowerCase()));
}

/**
 * The card as one viewer gets it. The reading level is their role: a manager
 * always reads the manager version, so logging in actually means something.
 */
export function publicCard(card: StoredCard, viewer: User, users: User[]) {
  const { headSha: _h, reading: _r, findings: _f, createdBy: _c, approvedAt: _p, ...rest } = card;
  // Shown as the author only when they wrote it: a removed member's card stays
  // with their team for visibility (cardOwner) but isn't credited to anyone else.
  const authorUser = users.find((u) => u.id === (card.authorUserId ?? card.createdBy));
  const reviewer = canReview(viewer, card);
  const v = card.explanation.verification;
  // Every reading level, and the list of problems, are for people who can judge the code.
  // Everyone else gets only their own level.
  const full = reviewer || isTechnical(viewer.role);
  const levels: Partial<Explanation["levels"]> = full ? card.explanation.levels : { [viewer.role]: card.explanation.levels[viewer.role] };
  const explanation = { ...card.explanation, levels, ...(v && !full ? { verification: { ...v, issues: [] } } : {}) };
  // File names are for people who read code; everyone else gets how far it reaches.
  const impact = card.impact && (full ? card.impact : { reach: card.impact.reach, totalFiles: card.impact.totalFiles, direct: card.impact.direct.length, entryPoints: card.impact.entryPoints.length, broken: card.impact.broken.length });
  return {
    ...(rest as Card & Pick<StoredCard, "orgId" | "source" | "createdAt" | "authorUserId" | "reports">),
    explanation,
    ...(impact ? { impact } : {}),
    authorPerson: authorUser ? personOf(authorUser, users) : null,
    viewer: {
      level: viewer.role,
      canReview: reviewer,
      // The author doesn't need to ask themselves; everyone else can.
      canAsk: !reviewer,
      canComment: isTechnical(viewer.role) || reviewer,
    },
    // The pitch commit offers its scripted question in Ask Why.
    ...(isPitchCommit(card.repo, card.headSha) ? { suggestedQuestion: PITCH_QUESTION.text } : {}),
  };
}

/** The badge a feed shows: score and whether the engineer should look first. */
const confidenceOf = (card: StoredCard) => {
  const v = card.explanation.verification;
  return v ? { score: v.score, level: v.confidence, checkedBy: v.checkedBy, needsReview: (v.needsReview || v.checkedBy === "code") && card.status !== "approved" } : null;
};

/** One line per card for feeds, at the viewer's level. */
export function feedItem(card: StoredCard, viewer: User, users: User[], extra: { comments: number; openQuestions: number }) {
  const authorUser = users.find((u) => u.id === (card.authorUserId ?? card.createdBy));
  const level = card.explanation.levels[viewer.role];
  return {
    id: card.id,
    title: card.explanation.title,
    summary: level.summary,
    impact: level.impact,
    risk: card.explanation.risk,
    status: card.status,
    repo: card.repo,
    ref: card.ref.kind === "commit" ? card.ref.sha.slice(0, 7) : `#${card.ref.number}`,
    committedAt: card.committedAt,
    source: card.source,
    author: authorUser ? personOf(authorUser, users) : null,
    authorName: authorUser?.name ?? card.author.name,
    files: card.files.length,
    /** One of the built-in sample changes, not real work. */
    sample: card.source === "demo",
    confidence: confidenceOf(card),
    reports: card.reports ?? 0,
    ...extra,
  };
}

const text = z.string().trim().min(1).max(600);
const levelEdits = z.object({ summary: text, analogy: text, impact: text }).partial();

export const editsSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  levels: z.partialRecord(z.enum(LEVELS.map((l) => l.key) as [string, ...string[]]), levelEdits).optional(),
});
