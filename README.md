# Rosetta

**Every commit, explained for whoever's reading.**

Engineers push code; managers, clients and the CMO need to know what it means for them. Rosetta reads each GitHub commit and explains it six ways, from a precise engineering summary to a plain-language note for a CMO, with a before-and-after flowchart, a worked example, and a check of how well the explanation matches the code. Questions go straight back to the engineer who wrote it, and answers come back rewritten for the person who asked.

Built by Team CodeCrunchers.

---

## The six readers

Your role is your reading level. Everyone sees the same change, written for them:

| Reader | Gets |
| --- | --- |
| Engineer | Function names, files, values and edge cases |
| Senior developer | A quick technical summary: patterns and risks |
| Intern | How and why, with the file worth reading first |
| Manager | Impact, risk, and whether plans change. No code |
| Client | What their money paid for, in business terms |
| CMO | Customers, campaigns and growth. Zero technical words |

Manager, client and CMO can also read everything in **Hinglish**.

## What it does

**Explanations people can trust**
- Explains any public commit or pull request: a summary, an everyday analogy, the impact, and a detailed flowchart (decisions, data, outcomes, before vs after) with a step-by-step worked example.
- Every explanation is checked against the real diff: plain code rules (no jargon for non-technical readers, no names that aren't in the change) plus a second AI model that scores it out of 100. Below 75 it's rewritten once with the problems as feedback; still low, it's flagged **Needs engineer review**.
- Select any box in the flowchart to see the lines of code behind it.
- The engineer who made the change reviews and edits it before it counts as reviewed, previewing all six versions.
- **Check accuracy** re-runs the checks step by step; the same change always gets the same score.

**A workspace that follows your org chart**
- A CMO or manager creates the workspace and adds people: CMO → managers → engineers, senior developers and interns; clients sit under their manager.
- Each person sees only what their role allows: engineers their own work, managers their team, the CMO everything.
- New commits arrive by themselves from watched repositories: the company installs the Rosetta **GitHub App** once (private repos too), and every `git push` is explained and lands with the right manager. No link to paste.

**Beyond the diff: what a change reaches**
- When a repository is first watched, Rosetta maps it once: every source file's imports and top-level functions and classes (names and paths only, never code). Each new commit moves that map forward.
- A commit is measured against the map: which functions it touched, added or removed, which files use them directly, which depend on those a few steps out, and which files still use something the change **removed**.
- The card shows **What else this touches**: a picture of the files that rely on the change, plus the lists. Engineers read the file names; managers, clients and the CMO get "how many other parts rely on this".
- The same facts go to the explainer and the checker, so a 5-line change to a shared function is rated and described for what it really reaches. A wide reach raises the risk; something still using a removed function marks it high.
- JavaScript and TypeScript (with tsconfig path aliases), Python, Go, Java and Kotlin, Ruby, PHP, C and C++, and Rust.

**Tasks, linked to the code**
- A board (To do, In progress, In review, Done) with drag and drop, filters, priority and due dates. Engineers move their own tasks, managers assign and reprioritise their team's, the CMO reads everything, and clients see only tasks shared with them.
- Put the task's key in a commit message (`CL-12: rotate requests`) and Rosetta links the two: the first commit moves it to **In progress**, a pull request to **In review**, and "fixes CL-12" plus the engineer's review of the explanation to **Done**. Tasks only move forward on their own, and the lead is told when Rosetta moves one.
- Each task shows what has actually been done on it, at the reader's own level: the engineer reads function names, the manager reads impact and risk, the CMO reads customers and growth. Nobody writes status updates.
- A change can also be linked or unlinked by hand. A key that looks like the workspace's but matches no task is reported to the engineer, never guessed.

**Conversations across roles**
- **Ask Why** on any step: answered from the code, or sent to the engineer with a technical version of the question.
- Questions, replies and engineers' comments are rewritten once for every reader. A rewrite that adds a number the original didn't have is thrown away.
- Readers can report a possible mistake straight to the author.

**Staying in the loop**
- Notification bell, plus email (invites, questions, replies, reports, password resets).
- **This week**: a one-page weekly digest, printable as a PDF, and a Monday email to the owner with every engineer's changes and flowcharts.
- Feed search in your own words, with date, risk and repository filters.

**Trust and privacy**
- Privacy Policy, Terms, Cookie Policy, Refund Policy, a full "what data we collect" table, contact and licences pages.
- Consent at signup, a storage banner with equal choices, **Download my data** and **Delete my account** in the profile.
- Keyboard-friendly, labelled forms; WCAG 2.2 AA contrast in both themes; tested with axe.

## How it works

```mermaid
flowchart LR
  A[Engineer pushes a commit] --> B[GitHub App webhook, or sync]
  B --> Q[Explain queue: one job per commit]
  Q --> C[Backend reads the diff from GitHub]
  C --> M[Repository map: what else does it reach?]
  M --> D[Gemini writes six versions + flowchart]
  D --> E{Code rules + second model<br/>score at least 75?}
  E -- no --> F[Rewrite once with feedback] --> E2{Still under 75?}
  E2 -- yes --> G[Saved, flagged for engineer review]
  E2 -- no --> H
  E -- yes --> H[Saved with score and code evidence]
  H --> I[Each reader sees their version]
  G --> I
  I --> J[Questions go to the engineer, answers come back rewritten]
  H --> T[A task key in the message links the task and moves it]
```

- **Frontend** (`frontend/`): Next.js 16, React 19, Tailwind CSS 4, Mermaid for flowcharts, Base UI, Motion. Talks only to the backend.
- **Backend** (`backend/`): an API-only Next.js 16 app. Every key lives here. Gemini explains; Groq (or OpenRouter) checks explanations, answers Ask Why and rewrites messages, and steps in when Gemini is unavailable. Data is stored in Firestore (over REST), or in a local JSON file when Firebase isn't configured.
- **GitHub App**: signs a short-lived JWT with its private key, trades it for an hour-long installation token, and reads private repos with that, never a person's token. Each push becomes one deduplicated job (retried with backoff, waiting out a used-up AI quota).
- Full diffs and source code aren't stored: only the explanation, a few lines behind each flowchart step, and the repository map (file paths, names and imports).

## Quick start

You need Node.js 22 or newer. No keys are needed to try it: three sample commits and a sample team work offline.

```bash
git clone https://github.com/vaibhav025/Rosetta-NSUT.git
cd Rosetta-NSUT

# Terminal 1: the API on http://localhost:4000
cd backend
npm install
cp .env.example .env.local
npm run dev

# Terminal 2: the website on http://localhost:3000
cd frontend
npm install
npm run dev
```

Open http://localhost:3000, create a workspace as a CMO or manager, then press **Add a sample team**. Every sample person can log in with the email and the random password shown once in the result, so you can see each role's view.

### Pushes from your own repository, on localhost

GitHub can't reach `localhost`, so a relay forwards its webhooks. With the GitHub App created and its keys in `backend/.env` ([DEPLOY.md](DEPLOY.md), step 4), keep three terminals open:

```bash
# 1. backend
cd backend && npm run dev

# 2. frontend
cd frontend && npm run dev

# 3. webhook relay (any folder): open https://smee.io, start a channel, set it as the App's Webhook URL
npx smee-client --url https://smee.io/<your-channel> --target http://localhost:4000/api/webhooks/github-app
```

Then, as the owner, open **Organisation → Connect GitHub**, install the App and tick the repositories to watch. Everyone who pushes links their GitHub account on their profile; commits nobody matches wait under **Unassigned commits** for a lead. After that, a push to a watched repository's default branch reaches the feed in under a minute. On a deployed backend the Webhook URL is simply `https://<backend>/api/webhooks/github-app` and no relay is needed.

## Configuration

Add keys to `backend/.env.local` as you need them:

| Key | Unlocks |
| --- | --- |
| `GEMINI_API_KEY` · `GEMINI_MODEL` | Explaining any commit; the model's name (default `gemini-3.8-flash`) |
| `FALLBACK_API_KEY` | Groq or OpenRouter: checking explanations, Ask Why, rewriting messages, backup for Gemini |
| `GITHUB_TOKEN` | More than 60 GitHub requests an hour, public repository sync |
| `GITHUB_APP_ID` · `GITHUB_APP_SLUG` · `GITHUB_APP_PRIVATE_KEY` · `GITHUB_APP_WEBHOOK_SECRET` | The GitHub App: pushes explained by themselves, private repos included. `GITHUB_APP_SLUG` is the name in `github.com/apps/<slug>` |
| `GITHUB_APP_CLIENT_ID` · `GITHUB_APP_CLIENT_SECRET` | "Link your GitHub account", so pushes are matched to the right person |
| `QSTASH_*` · `PUBLIC_API_URL` | Optional: run the explain queue through Upstash QStash |
| `FIREBASE_PROJECT_ID` · `FIREBASE_CLIENT_EMAIL` · `FIREBASE_PRIVATE_KEY` | Firestore instead of the local file (required in production) |
| `SESSION_SECRET` | Signs login tokens (required in production) |
| `SMTP_USER` · `SMTP_PASS` | Email, Gmail by default |
| `ALLOWED_ORIGINS` · `APP_URL` | The frontend's address, for CORS and email links |
| `CRON_SECRET` | The Monday weekly report email, and the daily run of the explain queue |

The frontend reads `NEXT_PUBLIC_API_BASE` (defaults to `http://localhost:4000`). Every option is documented in [`backend/.env.example`](backend/.env.example) and [`frontend/.env.example`](frontend/.env.example).

## Commands

| Where | Command | Does |
| --- | --- | --- |
| backend | `npm run build && npm test` | API tests on an isolated server (throwaway store, no AI, no email, a fake GitHub for the App), plus unit tests for the verifier, message rewriting, the repository map and task keys |
| backend | `npm run demo -- <api-url>` | Creates a ready-to-show workspace with every role and prints the logins |
| backend | `npm run migrate` | Copies local data into Firestore (dry run first, `-- --write` to copy) |
| backend | `npm run pitch:judge` | Re-scores the pitch commit's explanation with the real judge model |
| frontend | `npm run licenses` | Regenerates the open-source licence list shown on `/licenses` |
| both | `npm run typecheck` | TypeScript checks |

## Demo

There is a fixed pitch commit that always explains the same way, with no GitHub or AI calls, so a live demo can't fail:

```
https://github.com/vaibhav025/Rosetta-NSUT/commit/ca08ab4f0a3ecce71292c0be57ccfbd33ff6024e
```

Paste it as an engineer, then log in as their manager to see it arrive, ask a question, and read the engineer's answer in manager words. The full script, including the exact question and answer, is in [DEPLOY.md](DEPLOY.md#the-pitch-commit).

## Deploying

Two Vercel projects (`backend/` and `frontend/`), Firestore, and the GitHub App. Step by step in [DEPLOY.md](DEPLOY.md).

## Project layout

```
backend/
  src/app/api/       API routes (auth, team, feed, explain, cards, tickets, digest, ...)
  src/lib/           AI tasks and verifier, GitHub and the GitHub App, explain queue, store, email, roles and visibility
  src/lib/codegraph/ The repository map: parse files, resolve imports, measure what a change reaches
  src/lib/tasks.ts   Tasks: who sees and moves what, and how commits link and move them
  src/lib/demo/      Sample commits, sample team, the pitch commit and its script
  test/              API and unit tests (npm test)
  scripts/           demo, migrate, pitch:judge
frontend/
  src/app/           Pages: landing, auth, the app (/app/...), legal pages
  src/components/    Flowchart, card view, impact picture, tasks board, Ask Why, feeds, dashboards, consent, ...
  src/lib/           API client, session, roles, legal details, consent
DEPLOY.md            Deploying, and the pitch walkthrough
```

More detail: [backend/README.md](backend/README.md) (every API route, how data flows, known limits) and [frontend/README.md](frontend/README.md) (every screen and where things are).

## Good to know

- **AI and your code.** Explaining a change sends its diff to the AI provider. Rosetta currently uses Gemini's free tier, under which Google may use submitted content to improve its products. Use a paid tier before connecting private or confidential code. Details in the Privacy Policy (`/privacy`) and [backend/README.md](backend/README.md#before-real-customers-ai-providers-and-their-data).
- **AI can be wrong.** Every explanation is scored and reviewed by its engineer, but check anything important.
- **Legal pages are templates.** Business details in `frontend/src/lib/legal.ts` are placeholders to fill in, and the pages need review by a lawyer before launch.
- **Free tiers.** Gemini's free tier allows about 20 explanations a day, and a workspace gets a quarter of that by default (`AI_ORG_DAILY_SHARE`); commits over it wait for the reset. Leads can see today's usage on the Organisation page.
- **The repository map reads imports, not a compiler.** It follows `import`, `require`, `from ... import`, `#include` and the like, so computed or runtime imports aren't seen. It stops at 8,000 source files, skips files over 300 KB, and a repository over 80 MB compressed gets no map (explanations carry on without it). Fine for judging reach, not a guarantee that nothing else is affected.
- **Rate limits and the queue are per server.** Fine for one instance; use a shared store before running several.

## Licence

No licence has been chosen for this project yet. Open-source dependencies and fonts are listed with their licences on the `/licenses` page.
