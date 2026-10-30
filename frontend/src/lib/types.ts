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
  /**
   * Every level for reviewers and technical readers; non-technical readers
   * get only their own level, so any other key may be missing.
   */
  levels: Partial<Record<LevelKey, LevelText>>;
  verification?: Verification;
  evidence?: Record<string, Evidence>;
};

/** An explanation with every level present, e.g. the built-in samples. */
export type FullExplanation = Explanation & { levels: Record<LevelKey, LevelText> };

export type Verification = {
  /** null when no judge was available to score it. */
  score: number | null;
  unscored?: boolean;
  confidence: "high" | "medium" | "low";
  checkedBy: "ai" | "code" | "sample";
  issues: string[];
  retried: boolean;
  needsReview: boolean;
  checkedAt: string;
};

/** A few diff lines behind one flowchart step. */
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
  | "network"
  /** The browser stopped waiting; the server may still be working. */
  | "timeout";

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
  /** Set when they proved the GitHub account by logging in to GitHub. */
  githubId?: number;
  githubVerified?: boolean;
  /** Managers and CMOs: email when a teammate's push is explained. On unless turned off. */
  notifyEmailOnPush?: boolean;
  focus: Focus[];
  language: "en" | "hinglish";
  status: "active" | "invited";
  termsAcceptedAt?: string;
  termsVersion?: string;
  privacyVersion?: string;
  marketingOptIn?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StoredUser = User & { passwordHash?: string; inviteCode?: string };

export type Org = {
  id: string;
  name: string;
  ownerId: string;
  /** owner/repo names Rosetta watches for new commits. */
  repos: string[];
  /** Extra branches per repository; missing or empty means the default branch only. */
  branches?: Record<string, string[]>;
  webhookSecret: string;
  lastSyncAt?: string;
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
};

/** Text written once and stored at every reading level. */
export type Translated = { text: string; levels?: Partial<Record<LevelKey, string>> };

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
  /** Set when the question is about one step of one card (Ask Why). */
  context?: { cardId: string; nodeKey: string; technicalQuestion?: string };
  status: "open" | "answered" | "closed";
  messages: TicketMessage[];
  /** People who haven't seen the latest message. */
  unreadBy: string[];
  createdAt: string;
  updatedAt: string;
};

/* ------------------------------------------------------------------ */
/* API views (what the backend sends the browser)                      */
/* ------------------------------------------------------------------ */

export type ApiCode =
  | ApiErrorCode
  | "unauthorized"
  | "invalid_credentials"
  | "conflict"
  | "forbidden"
  | "bad_request"
  | "rate_limited"
  | "terms_required";

export type AiUsage = {
  date: string;
  gemini: ProviderUsage;
  fallback: ProviderUsage;
  tasks: Record<string, number>;
};
export type ProviderUsage = { configured: boolean; used: number; limit: number; left: number; exhausted: boolean; sharedLimitReached?: boolean };

export type OrgSummary = { id: string; name: string; ownerId: string };

export type Person = {
  id: string;
  name: string;
  role: Role;
  title?: string;
  githubLogin?: string;
  /** They proved this GitHub account by logging in to GitHub. */
  githubVerified?: boolean;
  status: "active" | "invited";
  managerId?: string;
  team: { id: string; name: string } | null;
  /** Made by "Add a sample team": not a real person. */
  sample?: boolean;
};

export type Member = Person & {
  email?: string;
  reports: number;
  manages: boolean;
  canMessage: boolean;
  inviteCode?: string;
};

export type TeamView = {
  me: Person;
  canAdd: Role[];
  /** The person who created the workspace: may change roles and remove people. */
  isOwner: boolean;
  members: Member[];
  org: OrgSummary & {
    repos: string[];
    branches: Record<string, string[]>;
    lastSyncAt: string | null;
    /** The GitHub App connection; getGithubStatus has the details. */
    github: { connected: boolean; account: string | null };
    webhookPath?: string;
    webhookSecret?: string;
  };
};

/* ---------- GitHub App ---------- */

export type GithubRepo = { fullName: string; private: boolean; defaultBranch: string; watched: boolean; branches: string[] };

export type GithubRepos = { connected: false; account: null; repos: [] } | { connected: true; account: string | null; repos: GithubRepo[] };

export type GithubQueue = { queued: number; running: number; done: number; failed: number; skipped: number; unassigned: number };

export type GithubStatus = {
  app: { configured: boolean; linkAccounts: boolean };
  connected: boolean;
  account: string | null;
  connectedAt: string | null;
  manageUrl: string | null;
  repos: string[];
  branches: Record<string, string[]>;
  lastWebhookAt: string | null;
  lastWebhookEvent: string | null;
  lastSyncAt: string | null;
  queue: GithubQueue;
  failures: { id: string; repo: string; sha: string; subject: string; error: string; tries: number; at: string }[];
};

/** Pushes Rosetta couldn't match to anyone, grouped by who GitHub says wrote them. */
export type UnassignedGroup = {
  key: string;
  login: string | null;
  email: string | null;
  names: string[];
  commits: number;
  repos: string[];
  latestAt: string;
  recent: { repo: string; sha: string; subject: string; committedAt: string }[];
};

export type Unassigned = {
  groups: UnassignedGroup[];
  people: { id: string; name: string; role: Role; githubLogin: string | null }[];
};

export type FeedItem = {
  id: string;
  title: string;
  summary: string;
  impact: string;
  risk: Risk;
  status: "draft" | "approved";
  repo: string;
  ref: string;
  committedAt: string;
  source: StoredCard["source"];
  author: Person | null;
  authorName: string;
  files: number;
  sample?: boolean;
  confidence: { score: number | null; level: Verification["confidence"]; checkedBy: Verification["checkedBy"]; needsReview: boolean; unscored?: boolean } | null;
  reports: number;
  comments: number;
  openQuestions: number;
};

export type Feed = {
  items: FeedItem[];
  page: { offset: number; limit: number; total: number; more: boolean };
  repos: string[];
  people: Person[];
  teams: { id: string; name: string; lead: string }[];
  myTeam: { id: string; name: string } | null;
  stats: { total: number; thisWeek: number; notReviewed: number; highRisk: number; openQuestions: number };
  sync: { repos: number; lastSyncAt: string | null };
};

export type NotificationItem = {
  id: string;
  kind: "question" | "reply" | "report" | "change" | "reviewed" | "joined" | "task";
  title: string;
  href: string;
  read: boolean;
  createdAt: string;
};

export type DigestCard = {
  id: string;
  title: string;
  summary: string;
  impact: string;
  risk: Risk;
  status: "draft" | "approved";
  committedAt: string;
  author: Person | null;
  authorName: string;
  confidence: { score: number | null; level: Verification["confidence"] } | null;
};

export type Digest = {
  org: { name: string };
  range: { from: string; to: string; week: number };
  headline: string;
  stats: { changes: number; reviewed: number; risky: number; questions: number; comments: number };
  highlights: DigestCard[];
  attention: (DigestCard & { reason: string })[];
  people: { person: Person; changes: number; reviewed: number }[];
  waiting: { id: string; subject: string; to: Person; since: string }[];
};

export type Shown = { text: string; original: string; translated: boolean };

export type CommentView = Shown & {
  id: string;
  author: Person | null;
  source: "rosetta" | "github";
  githubUrl?: string;
  createdAt: string;
  card?: { id: string; title: string } | null;
  repo?: string;
};

export type CardView = Card & {
  orgId: string;
  source: StoredCard["source"];
  authorUserId?: string;
  authorPerson: Person | null;
  viewer: { level: Role; canReview: boolean; canAsk: boolean; canComment: boolean; canLinkTasks?: boolean };
  comments: CommentView[];
  /** Tasks this change is linked to (by key in the commit message, or by hand). */
  tasks?: CardTask[];
  reports?: number;
  /** A ready question to offer in Ask Why (the pitch commit has one). */
  suggestedQuestion?: string;
  /** What the change reaches beyond its diff: in full for people who read code, counts for everyone else. */
  impact?: Impact | ImpactBrief;
};

export type Reach = "none" | "contained" | "moderate" | "wide";

export type Impact = {
  changed: { file: string; status: string; symbols: string[]; added?: string[]; removed?: string[] }[];
  direct: { file: string; uses: string[] }[];
  indirect: { file: string; depth: number; via: string }[];
  broken: { file: string; names: string[]; from: string }[];
  areas: { name: string; files: number }[];
  entryPoints: string[];
  totalFiles: number;
  capped?: true;
  reach: Reach;
  edges: [string, string][];
  mapFiles: number;
  mapSha?: string;
};

export type ImpactBrief = { reach: Reach; totalFiles: number; direct: number; entryPoints: number; broken: number };

export const isFullImpact = (i: Impact | ImpactBrief): i is Impact => Array.isArray(i.direct);

export type TicketSummary = {
  id: string;
  subject: string;
  kind: "question" | "report";
  status: Ticket["status"];
  direction: "sent" | "received";
  from: Person | null;
  to: Person | null;
  other: Person | null;
  unread: boolean;
  updatedAt: string;
  createdAt: string;
  preview: string;
  context: { cardId: string; nodeKey: string; cardTitle: string; technicalQuestion?: string } | null;
};

export type TicketDetail = TicketSummary & {
  stepLabel: string | null;
  messages: (Shown & { id: string; author: Person | null; mine: boolean; createdAt: string })[];
};

export type AskResult =
  | { answerable: true; answer: string }
  | { answerable: false; technicalQuestion: string; askTo: Person | null };

/* ---------- tasks ---------- */

export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
export type Priority = "urgent" | "high" | "medium" | "low";

/** A commit linked to a task, at the reader's level. */
export type TaskCommit = {
  cardId: string;
  title: string;
  summary: string;
  impact: string;
  risk: Risk;
  status: "draft" | "approved";
  repo: string;
  ref: string;
  committedAt: string;
  authorName: string;
};

export type TaskView = {
  id: string;
  /** "ROS-12": used in URLs and commit messages. */
  key: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee: Person | null;
  createdBy: Person | null;
  /** "YYYY-MM-DD" */
  dueDate: string | null;
  sharedWithClient: boolean;
  /** Sort ascending within a column. */
  order: number;
  commitCount: number;
  /** Latest linked commit, at the viewer's reading level: what's done so far. */
  progress: { title: string; summary: string; committedAt: string } | null;
  createdAt: string;
  updatedAt: string;
  statusChangedAt: string;
  /** "rosetta": moved automatically by a commit. */
  movedBy: "rosetta" | "person" | null;
  can: { edit: boolean; move: boolean; assign: boolean; delete: boolean };
};

export type TaskDetail = TaskView & { commits: TaskCommit[] };

export type TaskBoard = {
  tasks: TaskView[];
  /** The workspace's key prefix, e.g. "ROS". */
  prefix: string;
  canCreate: boolean;
  /** Whom the viewer may assign tasks to. */
  assignees: Person[];
  /** Assignees to offer in the filter. */
  people: Person[];
};

/** A task as a change lists it. */
export type CardTask = { key: string; title: string; status: TaskStatus };
