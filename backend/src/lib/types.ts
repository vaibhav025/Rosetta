import type { Impact } from "./codegraph/impact";
import type { LevelKey } from "./levels";

export type Risk = "low" | "medium" | "high";

/* ------------------------------------------------------------------ */
/* Flowcharts                                                          */
/* ------------------------------------------------------------------ */

/** start/end: rounded pill · step: box · decision: diamond · data: cylinder */
export type FlowNodeKind = "start" | "step" | "decision" | "data" | "end";
export type FlowNode = { id: string; key: string; kind?: FlowNodeKind; group?: string };
/** [from, to] or [from, to, labelKey]; the label text comes from the level's labels. */
export type FlowEdge = [string, string] | [string, string, string];
/** A box drawn around related nodes, e.g. "Server pool". */
export type FlowGroup = { id: string; key: string };
export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[]; groups?: FlowGroup[] };

/** A worked example traced through the "after" graph, one path per step. */
export type Walkthrough = { steps: { path: string[] }[] };

export type LevelText = {
  summary: string;
  analogy: string;
  impact: string;
  /** Text for every node key, group key and edge label key. */
  labels: Record<string, string>;
  /** The worked example, told at this level: a title and one line per step. */
  walkthrough?: { title: string; steps: string[] };
};

export type Explanation = {
  title: string;
  risk: Risk;
  riskReason?: string;
  files: string[];
  flow: { before: FlowGraph | null; after: FlowGraph };
  walkthrough?: Walkthrough;
  levels: Record<LevelKey, LevelText>;
  /** How well this explanation matches the code, from checks and a second model. */
  verification?: Verification;
  /** The lines of the diff behind each flowchart step, by node key. */
  evidence?: Record<string, Evidence>;
};

export type Verification = {
  /** 0 to 100. */
  score: number;
  confidence: "high" | "medium" | "low";
  /** "ai": code checks plus a second model; "code": code checks only; "sample": a hand-written sample. */
  checkedBy: "ai" | "code" | "sample";
  /** Problems found, in plain words, for the engineer. */
  issues: string[];
  /** True when the first attempt scored low and was rewritten with the problems as feedback. */
  retried: boolean;
  /** Low confidence even after a retry: the engineer should read it before anyone relies on it. */
  needsReview: boolean;
  checkedAt: string;
};

/** A few diff lines: "+" added, "-" removed, " " unchanged. */
export type Evidence = { file: string; url?: string; line?: number; lines: { kind: "+" | "-" | " "; text: string }[] };

export type FileChange = { path: string; additions: number; deletions: number; url: string };

export type CardRef = { kind: "commit"; sha: string } | { kind: "pull"; number: number };

/** A card as the frontend sees it. */
export type Card = {
  id: string;
  repo: string;
  ref: CardRef;
  url: string;
  author: { name: string; login: string };
  committedAt: string;
  /** "draft" = not reviewed by the engineer yet; "approved" = reviewed. */
  status: "draft" | "approved";
  approvedBy?: string;
  files: FileChange[];
  truncated?: { shownFiles: number };
  explanation: Explanation;
  /** What the change reaches beyond its diff, from the repository map (watched repos only). */
  impact?: Impact;
};

export type EditableField = "summary" | "analogy" | "impact";

export type CardEdits = {
  title?: string;
  levels?: Partial<Record<LevelKey, Partial<Record<EditableField, string>>>>;
};

export type ExplainEvent =
  | { type: "start"; title: string }
  | { type: "finding"; text: string }
  | { type: "writing" }
  | { type: "checking" }
  | { type: "rewriting" };

export type ApiErrorCode =
  | "invalid_url"
  | "private"
  | "not_found"
  | "unavailable"
  | "sample_only"
  | "network";

/* ------------------------------------------------------------------ */
/* People and organisations                                            */
/* ------------------------------------------------------------------ */

export type Focus = "timelines" | "cost" | "risk" | "how-it-works" | "user-impact";

/** The role is also the person's reading level; it can't be switched in the app. */
export type Role = LevelKey;

export type User = {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: Role;
  /** Who they report to. Empty for the person at the top. */
  managerId?: string;
  /** Managers name their team, e.g. "Payments". */
  teamName?: string;
  title?: string;
  /** Maps GitHub commits and comments to this person. */
  githubLogin?: string;
  /** Set by "Link your GitHub account" (GitHub login), with the account's numeric id. */
  githubId?: number;
  /** True when githubLogin was proven by logging in to GitHub, not typed in. */
  githubVerified?: boolean;
  /** Email when a change of someone you manage arrives from a push. On unless turned off. */
  notifyEmailOnPush?: boolean;
  focus: Focus[];
  language: "en" | "hinglish";
  status: "active" | "invited";
  /** When they accepted the Terms and Privacy Policy, and which versions. Unset for sample people. */
  termsAcceptedAt?: string;
  termsVersion?: string;
  privacyVersion?: string;
  /** Product update emails. Off unless they ticked the box. */
  marketingOptIn?: boolean;
  createdAt: string;
  updatedAt: string;
};

/** `sessionVersion` is bumped to log out every existing session. Missing means 0. */
export type StoredUser = User & { passwordHash?: string; inviteCode?: string; sessionVersion?: number };

export type Org = {
  id: string;
  name: string;
  ownerId: string;
  /** owner/repo names Rosetta watches for new commits. */
  repos: string[];
  webhookSecret: string;
  lastSyncAt?: string;
  /** Where the next sync reads from, when work was left over; lastSyncAt when missing. */
  syncCursor?: string;
  /** Set while a sync runs, so other server instances don't start a second one. */
  syncingUntil?: string;
  /** The week (its Monday, YYYY-MM-DD in IST) whose report was last emailed. */
  weeklyReportFor?: string;
  /**
   * The Rosetta GitHub App installation this workspace is connected to (a
   * string, so orgs can be looked up by it), and the GitHub account it's on.
   */
  githubInstallationId?: string;
  githubAccount?: string;
  githubConnectedAt?: string;
  /** Branches to explain, per repo. Missing or empty: the repo's default branch only. */
  branches?: Record<string, string[]>;
  /** GitHub usernames and commit emails (lower case) a lead assigned to a member. */
  githubAliases?: Record<string, string>;
  /** When the GitHub App last sent this workspace an event, and which. */
  lastWebhookAt?: string;
  lastWebhookEvent?: string;
  createdAt: string;
};

/** A card as stored. Diffs are never stored. */
export type StoredCard = Card & {
  orgId: string;
  /** The org member who wrote the change, matched by GitHub username. */
  authorUserId?: string;
  headSha: string;
  reading: string;
  findings: string[];
  createdBy?: string;
  /** "push": arrived through the GitHub App; "webhook": the older per-workspace webhook. */
  source: "manual" | "sync" | "webhook" | "push" | "demo";
  createdAt: string;
  approvedAt?: string;
  /** How many times readers reported a mistake in this explanation. */
  reports?: number;
};

/** Text written once and stored at every reading level. */
export type Translated = {
  text: string;
  levels?: Partial<Record<LevelKey, string>>;
  /** Hinglish versions for the non-technical levels, for people who chose Hinglish. */
  hinglish?: Partial<Record<LevelKey, string>>;
};

/** An engineer's comment: written in Rosetta or synced from GitHub. */
export type Comment = Translated & {
  id: string;
  orgId: string;
  cardId?: string;
  authorId: string;
  source: "rosetta" | "github";
  githubUrl?: string;
  repo?: string;
  createdAt: string;
};

export type TicketMessage = Translated & { id: string; authorId: string; createdAt: string };

/** A question between two people, e.g. a manager asking an intern what they're working on. */
export type Ticket = {
  id: string;
  orgId: string;
  fromId: string;
  toId: string;
  subject: string;
  /** "report": someone thinks the explanation of a change is wrong. */
  kind?: "question" | "report";
  /** Set when the question is about one step of one card (Ask Why). */
  context?: { cardId: string; nodeKey: string; technicalQuestion?: string };
  status: "open" | "answered" | "closed";
  messages: TicketMessage[];
  /** People who haven't seen the latest message. */
  unreadBy: string[];
  createdAt: string;
  updatedAt: string;
};
