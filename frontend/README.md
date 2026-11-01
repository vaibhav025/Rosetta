# Rosetta frontend

Next.js 16 + Tailwind v4. Visual rules come from `design.md`. The app needs the backend in `../backend`.

## Run

```bash
# terminal 1
cd ../backend && npm install && npm run dev      # http://localhost:4000
# terminal 2
npm install && npm run dev                       # http://localhost:3000
```

`NEXT_PUBLIC_API_BASE` defaults to `http://localhost:4000`. Create a workspace, then press **Add a sample team** to see every role.

## Legal, consent and accessibility

- **Fill in the placeholders** in `src/lib/legal.ts` before launch: `LEGAL_ENTITY`, `ADDRESS`, `CONTACT_EMAIL`, `GRIEVANCE_OFFICER` (name, email), `JURISDICTION_CITY`, `EFFECTIVE_DATE`, `GRIEVANCE_RESPONSE`, `REFUND_WINDOW`. Bump `POLICY_VERSION` (and the backend's versions) when a policy changes: the storage banner asks again.
- Legal pages are templates, not legal advice: have a lawyer review them. Other `[bracketed]` notes for the team are inside the page texts.
- `src/lib/consent.ts`: the storage choice (`rosetta:consent`). Anything optional added later (analytics, embeds) must check `hasConsent("analytics" | "embeds")` before loading.
- `npm run licenses` regenerates `src/lib/licenses.json` (shown on `/licenses`) from both apps' `package.json`.
- `next.config.ts` sets a Content-Security-Policy allowing only this site and `NEXT_PUBLIC_API_BASE`, plus `Referrer-Policy: strict-origin-when-cross-origin`. Add any new origin there.

## Screens

| Route | Who | What |
| --- | --- | --- |
| `/` | everyone | What Rosetta is, the slider demo, the detailed flowchart with its worked example, how changes reach people, pricing |
| `/signup` · `/join` · `/login` · `/forgot` · `/reset` | | Create a workspace (CMO or manager) · join with an invite code · log in · reset a password by email |
| `/app` | by role | Engineer and intern: **My work** (their changes, questions for them). Manager: **Team activity** (team changes filtered by engineer, stats, engineers' latest comments, check in with anyone). CMO: **Overview** (teams, then changes filtered by team or person). Client: reviewed **Updates** |
| `/app/c/[id]` | can see it | One change at the reader's own level: confidence badge ("Checked against the code: High (92/100)"), the tasks it's linked to (key, title, status; engineers and leads can **Link to task** or unlink), story, engineers' comments, "How it works" flowchart with before/after and a step-through example. Selecting a box shows the code behind it and opens Ask Why; "This step looks wrong" reports it to the author. **What else this touches**: how far the change reaches in the repository, as a picture of the files that rely on it (engineers and leads) or a plain count (everyone else), with a warning when something still uses what the change removed. The author reviews it, previewing all six versions |
| `/app/tasks` · `/app/tasks/[key]` | everyone | **Tasks**: a board of To do, In progress, In review and Done with drag and drop (and a "Move to..." menu for keyboard and touch), filters by person, priority and text, and a New task form. Each card shows key, priority, due date, assignee, commit count and what's been done so far, at the reader's level; "Moved by Rosetta" marks tasks a commit moved. A task's page edits its details where allowed and lists its linked commits, newest first |
| `/app/digest` | leads, clients | **This week**: headline, what changed, what needs attention, who shipped what. Save as PDF. Leads also preview and send the **weekly report email** (per engineer, every flowchart, written for the owner) |
| `/app/updates` | leads | Every change engineers push and their comments (Rosetta and GitHub), newest first, by engineer, team or kind |
| `/app/questions` · `/app/questions/[id]` | everyone | Questions asked of me / by me; threads rewritten for each reader |
| `/app/team` | leads | People by team (verified GitHub accounts ticked), add someone (invite code), GitHub: the owner connects the GitHub app, picks repositories and branches; leads see push status and match unknown authors (without the app: owner/repo box and webhook setup), today's AI use; the owner renames the workspace and manages people |
| `/app/profile` | everyone | Name, title, GitHub username, Link GitHub (verified account), push emails (leads), focus, language (English or Hinglish), password, product emails, Download my data, Delete my account |
| `/privacy` · `/terms` · `/cookies` · `/refunds` · `/data` · `/contact` · `/licenses` | everyone | Legal pages, each with an "In plain words" summary; linked from every footer |

Every signed-in page has the notification bell. Feeds have search (in the reader's own words), date, risk and repository filters, and "Show more".

## Where things are

- `src/components/flowchart.tsx`: `FlowDiagram` (JSON → Mermaid with shapes, groups and edge labels; path highlighting) and `HowItWorks` (before/after + walkthrough)
- `src/components/dashboards.tsx`: the per-role homes; `feed.tsx`: feed cards, search and filters
- `src/components/github.tsx`: connect GitHub, repository and branch picker, push status, unmatched pushes; `src/lib/github-app.ts`: the ?github= return messages
- `src/components/board.tsx` · `task-view.tsx` · `src/lib/tasks.ts`: the tasks board (drag and drop, optimistic moves), a task's page, and the helpers for ordering and due dates
- `src/components/impact.tsx`: "What else this touches" and its picture of changed, direct and further-out files
- `src/components/ribbon-field.tsx`: the animated background; it draws at 30 fps on the landing page and holds still inside the app once settled, so glass cards aren't re-blurred every frame
- `src/components/confidence.tsx` · `evidence.tsx`: the verification badge and the code behind each step
- `src/components/notification-bell.tsx` · `digest.tsx`: the bell (including "Rosetta moved a task") and the weekly page
- `src/lib/roles.ts`: roles, tabs per role
- `src/lib/api.ts`: every backend call; `src/lib/session.tsx`: login state
- `src/lib/mock/samples.ts`: the demo commits (shared with the backend), used on the landing page
