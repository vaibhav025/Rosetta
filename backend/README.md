# Rosetta backend

API-only Next.js 16 app between the browser and GitHub, Gemini, Groq and Firestore. Every key lives here.

## Run

```bash
npm install
cp .env.example .env.local   # set SESSION_SECRET at least for `npm start`
npm run dev                  # http://localhost:4000
```

With no keys it still runs: the three demo commits are served from hand-written explanations, Ask Why answers them from written notes, and data goes to `.data/store.json`. Add keys as you need them:

| Key | Unlocks |
| --- | --- |
| `GITHUB_TOKEN` | Real commits beyond 60 requests an hour, repository sync |
| `GEMINI_API_KEY` · `GEMINI_MODEL` | Explaining any commit (Gemini is kept for this, the big job) · the model's name, default `gemini-3.8-flash` |
| `FALLBACK_API_KEY` | Groq or OpenRouter: the judge that checks explanations, Ask Why, rewriting messages for each role, personal notes, and explaining when Gemini is out |
| `GEMINI_DAILY_LIMIT` · `FALLBACK_DAILY_LIMIT` | Free-tier daily limits (20 and 1000). Rosetta stops calling a provider before it fails, and leads see the count |
| `AI_ORG_DAILY_SHARE` | Share (0 to 1, default 0.25) of each daily limit one workspace may use. Gemini resets at midnight Pacific time |
| `FIREBASE_*` | Firestore instead of the local file (required on Vercel) |
| `SESSION_SECRET` | Signs login tokens; required in production |
| `ALLOWED_ORIGINS` | The frontend's origin(s) for CORS |
| `SMTP_USER` · `SMTP_PASS` | Email: invites, questions, replies, reports, new changes, password reset |
| `APP_URL` | The frontend's address, for links in emails and where GitHub sends people back |
| `GITHUB_APP_ID` · `GITHUB_APP_PRIVATE_KEY` · `GITHUB_APP_SLUG` (the name only; a pasted `github.com/apps/<name>` URL works too) · `GITHUB_APP_WEBHOOK_SECRET` | The Rosetta GitHub App: connect once, and every push to a watched repo (private too) is explained by itself. How to create it: [DEPLOY.md](../DEPLOY.md), step 4 |
| `GITHUB_APP_CLIENT_ID` · `GITHUB_APP_CLIENT_SECRET` | "Link your GitHub account", and confirming who connected an installation |
| `QSTASH_TOKEN` · `QSTASH_CURRENT_SIGNING_KEY` · `QSTASH_NEXT_SIGNING_KEY` · `PUBLIC_API_URL` | Optional: run the explain queue through Upstash QStash instead of after the webhook answers |
| `JOBS_BACKOFF_MS` | First retry delay for a commit that failed to explain (default 60000, doubles) |
| `GITHUB_API_URL` · `GITHUB_WEB_URL` | Only for tests: point GitHub at a local fake |

## Before real customers: AI providers and their data

Explaining a change sends its diff, commit message and file names to the AI provider, and Ask Why, comments and messages are sent too (see `/privacy` on the frontend).

- **Gemini's unpaid tier** (Google AI Studio free key): under Google's Gemini API terms, Google uses content sent to unpaid services to improve its products, and human reviewers may read it. Google also requires paid services for apps offered to users in the EEA, UK and Switzerland. **Move to a paid Gemini tier before real customers connect private code.**
- **Groq**: by default it keeps no inference data, but may log inputs and outputs for up to 30 days for reliability and abuse checks. Turn on **Zero Data Retention** in Groq's Data Controls, and confirm in Groq's Services Agreement whether API data can be used for training.
- Update the Privacy Policy (`frontend/src/app/privacy/page.tsx`) whenever the providers or their terms change.

## Consent and personal data

- Signup and join require `acceptTerms: true` (else `400 { code: "terms_required" }`) and take an optional `marketingOptIn`. The user records `termsAcceptedAt`, `termsVersion`, `privacyVersion` and `marketingOptIn`. Versions live in `src/lib/legal.ts` and must match `POLICY_VERSION` in `frontend/src/lib/legal.ts`.
- `GET /api/me/export` returns everything about the signed-in user as JSON (never the password hash).
- `DELETE /api/me` (`{ confirm: "<email>", deleteWorkspace? }`) deletes the account as described in `src/lib/account.ts`: comments and messages stay as "Former member", reports move up, notifications, notes and reset links go. Owners hand the workspace over (`POST /api/org/owner`) or delete all of it.

## Commands

| Command | Does |
| --- | --- |
| `npm test` | API tests on an isolated server (throwaway file store, no AI, no email), plus unit tests for the verifier and message rewriting. Run `npm run build` first |
| `npm run demo -- <api-url>` | Creates a ready-to-show workspace (CMO, manager, engineer, senior dev, intern, three changes) and prints the logins |
| `npm run pitch:judge` | Re-scores the pitch commit's explanation with the real judge model (3 runs), to keep its recorded 95/100 honest after edits |
| `npm run migrate` | Copies `.data/store.json` into Firestore. Dry run by default; `-- --write` to copy, `-- --write --overwrite` to replace existing documents |

## How it's organised

- **Workspaces and a reporting tree.** A CMO or a manager creates the workspace (`/api/auth/signup`). Leads add people under them (`/api/team/members`), who join with an invite code (`/api/auth/join`). CMO → managers → engineers, senior devs, interns; clients sit under the manager who added them. The owner can change roles, move people and remove them.
- **Role = reading level.** Every response is written at the viewer's role. A manager can't switch to the intern version. Only the author of a change, while reviewing it, can preview all six versions.
- **Who sees what.** Engineers and interns see their own changes. A manager sees everyone below them. A CMO sees the whole workspace. Clients see reviewed changes of their manager's team. Cards outside that answer `404`.
- **Changes arrive by themselves.** The owner connects the Rosetta GitHub App once (`/api/github/install`) and picks repos and branches to watch (`PATCH /api/org`). Every push to them reaches `/api/webhooks/github-app`, and each commit becomes a job in the explain queue (`src/lib/jobs.ts`): deduplicated, retried with backoff, waiting out a used-up AI quota, run by QStash or right after the webhook answers, on feed loads and by a daily cron. Bots, merges, `style:` and lockfile-only commits are skipped. Authors are matched by linked GitHub account, typed username, email, then a lead's assignment; commits nobody matches are "unassigned" (no AI spent) until a lead assigns them (`/api/github/unassigned`). The older per-workspace webhook (`/api/webhooks/github?org=…`) and the sync (`POST /api/sync`, also run in the background when a feed is older than 5 minutes) feed the same queue. Repos are read with the workspace's installation token (private repos), else `GITHUB_TOKEN`.
- **A map of each watched repository** (`src/lib/codegraph/`). When a repo is first watched (`PATCH /api/org`), or its first commit arrives, the repository's tarball is streamed (gunzip, then `tar.ts`, so it's never in memory whole) and every source file is read for its imports and top-level definitions (`parse.ts`: plain patterns per language, comments blanked first). `resolve.ts` turns each import into a file in the repo (relative paths, tsconfig `paths` and `baseUrl`, Python packages, Go modules, Java and Kotlin packages, Rust `mod` and `crate::`, PHP namespaces, C includes); packages from outside the repo resolve to nothing. The map is stored gzipped in chunks (`graphs`, `graph_chunks`, under Firestore's 1 MB document limit) and moved forward commit by commit: only the files a commit touched are read again, and a commit touching more than 40 source files rebuilds it. It never holds code, only paths, names and imports.
- **Each commit is measured against the map as it stood just before it** (`impact.ts`): the definitions its diff touched, added and removed; files that import exactly those (or the whole file); files that import those, up to 3 steps out; files still importing something the change deleted; the areas of the codebase and the screens, routes and handlers reached. The result is saved on the card as `impact`, and `impactText()` gives the explainer and the checker the same facts as a few lines. `reach` (none, contained, moderate, wide) raises the risk. Demo commits and unwatched repos get no map. A failure never stops the explanation: it just goes ahead without it.
- **Tasks** (`src/lib/tasks.ts`, `task-keys.ts`). Keys are `<PREFIX>-<n>`, the prefix taken from the workspace name (`PATCH /api/org { taskPrefix }` changes it for new tasks). The CMO sees every task, a manager their team's, an engineer their own, a client only those shared with them (and only reviewed commits). Moving and editing need it to be yours or your team's; assigning and sharing are for the task's lead; the CMO is read-only unless they made it. When a commit is explained (push, sync or pasted link), keys in its message link the task and move it forward: a commit is **In progress**, a pull request **In review**, and "fixes/closes/resolves KEY" is **Done** once the engineer approves the explanation (`POST /api/approve`). Tasks never move backwards by themselves, only the lead is notified (`kind: "task"`), keys of another tool are ignored, and a key of this workspace's prefix that matches no task is reported to the engineer.
- **Every explanation is checked** (`src/lib/verify.ts`). Plain code rules (no code words for manager, client and CMO; no names that aren't in the diff; before and after must differ) plus a second model that scores accuracy, completeness, the flowchart and reader fit. Below 75 it's rewritten once with the problems as feedback, and the better one is kept; still below 75 is flagged "Needs engineer review". Each flowchart step stores the diff lines behind it (`evidence`), so any reader can see the proof.
- **Messages for each reader.** Comments, questions and replies are rewritten once for all six levels, plus Hinglish for manager, client and CMO. A rewrite that adds a number the original didn't have is thrown away (fact guard).
- **Notifications.** Questions, replies, reports, new changes, reviews and joins appear in the bell, as well as by email.

## Routes

Send `Authorization: Bearer <token>` once logged in. Errors are `{ code, message }`.

| Route | Who | Does |
| --- | --- | --- |
| `POST /api/auth/signup` | anyone | Create a workspace as `cmo` or `manager` (needs `acceptTerms: true`) |
| `POST /api/auth/login` | anyone | Email + password (rate limited) |
| `POST /api/auth/forgot` · `POST /api/auth/reset` | anyone | Email a reset link · set a new password with it |
| `GET /api/invites/:code` · `POST /api/auth/join` | invitee | Look up and accept an invite |
| `GET` · `PATCH /api/me` | signed in | Profile and preferences (not role) |
| `POST /api/me/password` | signed in | Change password (needs the current one) |
| `GET /api/team` | signed in | People, who you manage and can message, invite codes, repos, webhook |
| `POST /api/team/members` · `PATCH` · `DELETE /api/team/members/:id` | leads · owner | Add someone · edit (owner: role, manager) · remove (owner) |
| `PATCH /api/org` | owner | Name, watched repositories, branches per repo, task prefix. Newly watched repos are mapped in the background; dropped ones forget their map |
| `POST /api/sync` | leads | Pull new commits and comments now |
| `POST /api/webhooks/github?org=` | GitHub | Older per-workspace webhook: pushes and comments, HMAC-verified, into the queue |
| `POST /api/webhooks/github-app` | GitHub | The GitHub App's webhook: push, installation, installation_repositories, comments (`GITHUB_APP_WEBHOOK_SECRET`) |
| `GET /api/github/install` | owner | `{ url }` to install the App, with a signed state |
| `GET /api/github/callback` | GitHub (browser) | The App's Setup URL; ends at `APP_URL/app/team?github=connected` or `?github=error&reason=` |
| `DELETE /api/github/installation` | owner | Disconnect the App in Rosetta |
| `GET /api/github/repos` | leads, owner | Repos the installation can read, with watched and branches |
| `GET` · `DELETE /api/github/link` | signed in | `{ url }` to link your GitHub account · forget the link |
| `GET /api/github/link/callback` | GitHub (browser) | The App's Callback URL; ends at `APP_URL/app/profile?github=linked` |
| `GET /api/github/unassigned` · `POST /api/github/unassigned/assign` | leads | Pushed commits nobody matched · say whose they are |
| `GET /api/github/status` | leads, owner | Connection, last event, queue counts, last failures |
| `GET` · `POST /api/github/graph` | leads, owner | The repository map of each watched repo (`missing`, `building`, `ready`, `failed`, `too_large`, file count, languages) · map it again from its newest commit (3 an hour per repo) |
| `POST` · `GET /api/jobs/run` | QStash · Vercel cron | Run the explain queue (Upstash signature or `CRON_SECRET`) |
| `GET /api/feed?author=&team=&status=&q=&risk=&repo=&days=&offset=&limit=` | signed in | Changes for this person at their level, searchable, paged |
| `GET /api/digest?week=` | leads, clients | The week on one page: headline, what changed, what needs attention, who shipped what |
| `POST /api/explain` | signed in | Explain a pasted link (NDJSON stream: start, finding, writing, checking, rewriting, card) |
| `GET /api/cards/:id` | can see it | The change at the viewer's level, with comments, verification, evidence, `impact` (full for engineers and leads, counts for everyone else) and `tasks` |
| `POST` · `DELETE /api/cards/:id/tasks` | the author, leads | `{ key }`: link a change to a task by hand (moves the task like a commit would) · unlink (the task keeps its column) |
| `GET` · `POST /api/tasks` | signed in | The board: tasks this person may see, each with the latest linked commit at their level (`?assignee=&priority=&q=`) · create one (not clients) |
| `GET` · `PATCH` · `DELETE /api/tasks/:key` | who may see it | One task with its linked commits · edit, move (`status`, `order`), assign, share with clients · delete (its commits stay, unlinked) |
| `POST /api/cards/:id/reexplain` | author, leads | Explain again from the code |
| `DELETE /api/cards/:id` | author, owner | Delete a change with its comments and notifications; sync won't re-add it, pasting the link again does |
| `POST /api/cards/:id/report` | readers | Report a possible mistake to the author |
| `GET /api/cards/:id/for-me` | can see it | A two-sentence personal note |
| `POST /api/cards/:id/comments` | engineers | Add a comment |
| `GET /api/comments?author=&team=` | signed in | Comments from people you can see |
| `POST /api/approve` | the author | Edit and mark reviewed |
| `POST /api/ask` | can see it | Answer from the code, or who to ask |
| `GET` · `POST /api/tickets` | signed in | Your questions · ask someone |
| `GET` · `POST` · `PATCH /api/tickets/:id` | participants | Read (marks read) · reply · close or reopen |
| `GET` · `POST /api/notifications` | signed in | The bell · mark read |
| `GET /api/usage` | leads | Today's AI calls against the daily limits |
| `POST /api/cards/:id/check` | can see it | Check accuracy: re-runs every check against the real diff, streamed step by step (NDJSON); the same card always gets the same score |
| `GET` · `POST /api/digest/report` | leads | Weekly report email: who it can cover · preview (and optionally send to the owner), real week or the sample week |
| `GET /api/cron/weekly` | Vercel cron | Monday 9:00 IST: emails each owner their engineers' week (needs `CRON_SECRET`) |
| `POST /api/demo/seed` | leads | Add a sample team with changes, comments, a question and notifications |
| `GET /api/me/export` | signed in | Download my data (JSON) |
| `DELETE /api/me` | signed in | Delete my account (type your email); owners must hand over or delete the workspace |
| `POST /api/org/owner` | owner | Hand the workspace to another CMO or manager |
| `GET /api/health` | anyone | What's configured (never values), and deploy warnings |

## Sample team

On an empty workspace, "Add a sample team" creates Arjun (engineer), Priya (senior dev) and Rahul (intern) under the manager (a CMO also gets a manager, Neha). Each can log in with the email and the random password shown once in the result, so every role's view can be tried.

## Known limits

- Rate limits are kept in memory, so each server instance counts on its own.
- Login tokens last 30 days and aren't revoked when a password changes.
- Webhooks need the server reachable from GitHub (deployed, or smee.io locally: see DEPLOY.md).
- The repository map reads imports with patterns, not a compiler: computed and runtime imports aren't seen, and a framework's implicit wiring (file-based routing, dependency injection) only shows where files import each other. It maps at most 8,000 source files, skips files over 300 KB, and gives up on repositories over 80 MB compressed. A map that commits couldn't move forward is rebuilt after a week.
- Task keys only link inside their own workspace. A commit that arrives out of order is measured against the map as it is, not as it was.
- Every pushed commit is explained (no cap); the daily AI quota bounds it, and commits over it wait for the reset.
- The queue's claim is a write-then-read check, not a transaction: two servers racing for one job very rarely both explain it (the card comes out the same).
- Free tiers: Gemini allows about 20 explanations a day; Groq allows 8,000 tokens a minute, so a busy minute waits a few seconds.
