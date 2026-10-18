# AB HQ — Project Guide

The standing context for every work session on AB HQ, local or online. Read this first. Keep it current: the **Where we left off** section at the bottom is updated at the end of every session and committed with the code.

AB HQ ("Andy's HQ") is a personal operating system for one user: Andy Baum, an equity partner who runs a litigation practice of 70+ active matters. He is the only user and the product owner. It is the system of record for his tasks, cases, time, and daily rituals. **It is not a front end for Notion.** A Notion-as-the-store direction was explored in 2026-09 and dropped.

---

## How we work

**Cadence.** Build a batch, Andy lives with it, he comes back weeks later with tweaks. Sessions are spaced out, so nothing depends on anyone remembering the last one.

**Restarting a session.** When Andy says "let's pick up AB HQ":
1. Read this guide.
2. Run `git log --oneline -30` to see what actually shipped.
3. Pull the tweak list (below).
4. Tell Andy where things stand and what's queued *before* touching code.

**The tweak list.** While using the app, Andy captures ideas with ⌘K into a project named **AB HQ** in the app itself. To read it, query open tasks whose `project_id` matches the project named `AB HQ` (Supabase project `eyqfdjmkkrfxfiahoozs`). If database access isn't connected, ask Andy to paste the list. *(The project needs to be created once in the Projects hub.)*

**Ending a session.** Update **Where we left off**, then commit and push it with the code.

---

## Standing rules

- **Andy tests on the live site** (https://ab-hq.vercel.app), never a local dev server. Once a feature builds cleanly, commit and push. Uncommitted work is invisible to him.
- **Deploys are push-to-deploy.** Pushing `main` builds on Vercel. After every push, run `npx vercel ls` and confirm the new deployment reads **Ready** before saying it's live. A local `next build` can pass on a stale type-check cache: `rm tsconfig.tsbuildinfo` before the final verification build. Failed deploy logs: `npx vercel inspect --logs <url>`.
- **Migrations are manual.** Andy pastes each `supabase/migrations/NNNN_*.sql` into the Supabase SQL Editor himself, often *after* the deploy is live. So:
  - write migrations idempotent (safe to re-run);
  - make code tolerate the pre-migration schema (pattern: `selectTaskRows()` in `lib/task-map.ts`, the `needsMigration` flag in `getProjectsPageData`). A deploy that queries a missing column takes down every page that shares the query, not just the new one;
  - tell Andy up front that a migration is a blocking step, and paste the SQL into the chat.
  - **Applied:** 0001–0015 (all tables present as of 2026-10-18).
- **Next.js 16 is not the Next.js in training data.** Read `node_modules/next/dist/docs/` before using an unfamiliar API. `params` and `searchParams` are Promises.
- **Secrets** live in `ab-hq/.env.local` (gitignored) and in Vercel env vars. Never commit them. Vars: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (a new-style `sb_secret_…` key), `APP_PASSWORD`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`. Sensitive vars target production + preview only (Vercel won't allow `development`).
- **Code hygiene Andy cares about:** reuse shared primitives, keep separation of concerns, aim for components under ~300 lines. Several screens are over that now; split them when you're already working in them, not as a drive-by.
- **Don't re-propose** these settled questions: Notion as the store; Outlook/calendar integration (the firm locked down ICS publishing and Graph app registration, so manual event entry is the accepted state); Eisenhower important/urgent (P1–P4 replaced it); a Health domain (domains are Work / Personal only).

---

## Stack and infrastructure

| Piece | Detail |
|---|---|
| App | Next.js 16 App Router, React 19, TypeScript, hand-written CSS (no Tailwind). Lives in `ab-hq/`; the git root is the workspace folder above it. |
| Data | Supabase Postgres, project `eyqfdjmkkrfxfiahoozs` (West US). RLS on with **no policies**: only the server, holding the secret key, can read or write. The browser never talks to the database. |
| Hosting | Vercel project `ab-hq`, **Root Directory = `ab-hq`**, functions pinned to `sfo1` next to the database (`vercel.json`). |
| Repo | https://github.com/pastafaucet/AB-HQ (private). |
| Auth | Single-user passcode. `middleware.ts` redirects to `/login` without a valid session. Session = HMAC-signed httpOnly cookie `ab_hq_session`, 30 days (`lib/auth.ts`, `app/auth-actions.ts`). Rotating the passcode means updating `APP_PASSWORD` in both `.env.local` and Vercel. |
| AI | `@anthropic-ai/sdk`, model `claude-opus-5`. Used for routing captures (`lib/route-entry.ts`) and drafting billing narratives (`app/(app)/billing-actions.ts`). |
| Time zone | The app's "today" is pinned to Pacific time (`lib/task-map.ts`). |
| Testing | `playwright-core` (system Chrome via `channel: 'chrome'`) for end-to-end scripts against the live database. |

---

## The app, screen by screen

The sidebar (`lib/nav.ts`) shows the full hub layout from the original prototype. Only some hubs are built. The rest route to a shared placeholder at `app/(app)/hub/[slug]`.

**The daily loop**
- **Start of Day** (`/start-up`, `StartUpClient`): the morning ritual. "On tap from yesterday," overdue and due-today triage, project obligations this week, the morning-body check-in, the morning routine, and the **MIT picker** that chooses today's three.
- **Today** (`/my-day`, `MyDayClient`): quick-add, the protected Top 3 (MITs), Also Today, In Progress. The right rail has the capacity bar and the schedule grid.
- **Wind Down** (`/wind-down`, `WindDownClient`): the evening ritual. Close out open tasks with one click, "On tap for tomorrow" (tomorrow's picks), the journal ("top things of the day"), habits, body metrics, the media log, and "A year ago today."

**Home**
- **Andy's HQ** (`/`, `CommandCenterClient`): the Command Center. An attention band, "The day" flow, UP NEXT (real task rows that open the drawer), and a live hub grid.

**Action**
- **Quick Drop / Inbox** (`/hub/inbox`): the capture ledger's inbox. Entries the AI router couldn't confidently file wait here.
- **Tasks** (`/hub/tasks`): the full task hub, including a calendar view.
- **Projects** (`/hub/projects`): projects as entities, with a terminal deadline, a matter link, and a drawer.
- **Cases** (`/hub/cases`): matters, with lifecycle (disposition, closed date) and people.

**Reviews and tracking**
- **Weekly** (`/hub/weekly`): the Friday review. The week that was, tasks done, captures, matters touched, matters with no next action, billed time entered, and the life week.
- **Time** (`/hub/time`): the day ledger per matter and first-draft billing narratives in Andy's format.

**Knowledge**
- **Notes** (`/hub/notes`): rich text (Tiptap) with links, @mentions, pins, tags, Inbox/Active/Archived status, search (AND terms, quoted phrases), and images (paste, drop, or the ▣ Image button; drag a bottom corner to resize).
- **People** (`/hub/people`): contacts linked to matters.

**Placeholders (not built):** Goals, Calendar, Monthly, Knowledge hub, Tag list, Habits, Journal, Health, Scuba, 3D Printing, Games. Habits, journal, and body metrics are captured inside the rituals today. Their hubs don't exist yet.

---

## Core behaviors worth knowing

- **Tasks:** type is Task / Event / Deadline. Priority is P1–P4 (red / green / yellow / gray). Domain is Work / Personal. One `do_date` plus an optional `do_time`, `duration_min` as the estimate, matter and project as **separate** fields, `waiting_on`, notes, and recurrence.
- **MITs:** a plain `tasks.mit` flag, capped at **3** server-side (`MIT_CAP` in `task-actions.ts`). Start of Day is where they get picked.
- **The schedule shows Events only.** An item appears on the grid only if it is an Event with a time on today's date. Timed *tasks* stay in the lists. Drag to reschedule, drag from a list onto the grid, resize from the bottom edge. Everything snaps to 15 minutes. With no estimate, a block is 15 minutes.
- **Capacity** counts only explicit estimates (`duration_min` set). Events with no estimate add nothing. It's computed from the whole Today set, not just items dated today.
- **Timers:** `time_sessions` (one running at a time, survives refresh and other devices). Sessions are editable in the task drawer: start, end, date, note, delete, and manual add. **A session must belong to a task.**
- **Activity log:** `task_activity` auto-records creation, priority and status changes, moves to today, MIT changes, and completion.
- **Recurrence:** completing a recurring task spawns the next one. Rules are JSON on `tasks.recur` (`lib/recur.ts`): daily, weekly, monthly, yearly, the nth weekday, the last workday.
- **The capture ledger** (`entries`): ⌘K is the single capture box. The raw text is kept forever. AI routing (`lib/route-entry.ts`) classifies the entry as a log, task, note, or event, matches a matter or project, pulls out dates and delegation, and drafts a one-line summary. A task created from an entry links back to it. Billed time rides along as `billed_tenths`.
- **Note images:** stored in the **private** Supabase Storage bucket `note-images` (25 MB cap; PNG/JPEG/GIF/WebP). The browser uploads straight to storage through a one-time signed URL from `startNoteImageUpload`, which avoids Vercel's ~4.5 MB request limit. Notes reference `/api/note-images/<uuid>`, which serves only behind the passcode by redirecting to a short-lived signed URL. **That address must never end in a file extension**: the middleware skips auth for paths ending in `.png`/`.jpg` and similar. A paste that also carries text (from Word or a web page) uses the editor's normal rich paste, so the words aren't lost.
- **Editor JSON must be plain objects before it's saved.** ProseMirror builds node attributes as null-prototype objects, and the server-action encoder silently drops them. `NoteEditor` round-trips `getJSON()` through `JSON.stringify` for this reason. Before 2026-10-18 every saved note lost its node attributes (mention ids, task checkmarks, list start numbers).
- **Billing:** captures and tracked timer time roll up into one line per matter in Andy's house format, `activity (.4); activity (.2)`. Minutes round up to tenths. Unknown time renders as `(.__)` to fill in. AI drafts are a starting point, always reviewed by Andy.

## Quick-add syntax (`lib/quick-parse.ts`)

The same parser runs in Today's quick-add, the Tasks hub, and ⌘K. An empty focused box shows this cheat line:

`hearing Theberge 10/30 at 9:30` · `oppo due friday p1` · `every tuesday` · `2nd tuesday of the month` · `(1)` `(.5)` `~2h` = estimate · `2-3:30pm` · `#personal`

It also recognizes types (hearing/meeting → Event, "due" → Deadline), matter names, and project names. A task that names a project inherits the project's matter.

---

## Data model (`supabase/migrations/`)

| Table | Holds |
|---|---|
| `matters` | Cases: name, client, stage, status, disposition, `closed_at` |
| `tasks` | Everything above, including `mit`, `recur`, `project_id`, `waiting_on`, and `project` (a legacy text column) |
| `projects` | name, matter, deadline, status, notes |
| `time_sessions` | task timers: `task_id`, `started_at`, `ended_at` (null while running), note |
| `task_activity` | per-task history lines |
| `entries` | the capture ledger: raw text, kind, status, matter, project, task, summary, `billed_tenths`, `routed_by` |
| `daily_entries` | one row per day: intention, reflection, `on_tap_for_tomorrow`, journal |
| `notes`, `note_links`, `tags`, `note_tags` | the Notes hub |
| `people`, `matter_people` | contacts and their matter links |
| `habits`, `habit_checks`, `body_metrics`, `media_log` | the life half of the rituals |

Server actions live in `app/(app)/*-actions.ts`. Reads are in `lib/queries.ts`. Row-to-object mapping is in `lib/task-map.ts` and `lib/entry-map.ts`. `lib/task-patch.ts` is shared by every screen that edits tasks optimistically. Types are in `lib/data.ts`.

---

## Design decisions and the reasons behind them

- **Scope decides what gets built; the prototype decides how it looks.** `Design Docs/AB_HQ_Scope.md` set the lean V1. `Design Docs/AB HQ Example.html` sets the look: dark ground `#0b0e13`, accent `#5b8cff`, IBM Plex Sans/Mono plus Newsreader. Tokens live in `app/globals.css`. Names follow the prototype: "Andy's HQ," "Start of Day," "Today," "Wind Down."
- **The full hub layout stays in the sidebar** even where hubs aren't built, because the sidebar is part of the look.
- **P1–P4 instead of important/urgent.** Andy's call. It's simpler and maps to colors he scans at a glance.
- **One date per task.** A separate deadline field was folded into `do_date`. Deadlines are a task *type*.
- **Matter and project are separate fields.** A project can span tasks under one matter, or have none.
- **Only Events go on the schedule.** It keeps the calendar honest about what's actually blocked out.
- **Don't invent estimates.** Capacity is only as good as the estimates entered. A default of 15 minutes beats a guessed hour.
- **Raw captures are permanent.** AI routing annotates and never rewrites, because the raw entry is the record a bill may later rest on.
- **Billing drafts are always reviewed.** The system turns time entry into editing instead of remembering. It never sends anything on its own.
- **Server-only data access.** One user, so no per-user policies. The secret key never leaves the server.

---

## Where we left off

*Updated 2026-10-18.*

**This session (2026-10-18):** Added this guide. Notes accept pasted, dropped, and picked images, resizable and private. Fixed three notes bugs found while testing: (1) clicking "+ Note" left the old note editable until the new one arrived, so a fast title went onto the old note; (2) editing one note and switching to another within 600 ms dropped the first note's last edit; (3) the save step stripped every node attribute (see Core behaviors).

**Loose ends from this session:**
- A test run overwrote the title of Andy's Sept 2 note (the petitions / COLA - AB 218 note, id `52775adb…`). It now reads "ZZ paste test (safe to delete)". The body is intact. Waiting on Andy for the original title.
- Four test notes ("QA image paste test" 1–3 plus an untitled "After the screenshot.") are still in the database. Andy declined my delete; he may remove them himself.
- Images aren't deleted from storage when a note or image is deleted. Fine at this volume; worth a cleanup job later.
- Pre-existing lint errors in `NoteEditor.tsx` (refs written during render, lines ~96–190). The build passes; clean them up next time that file is touched.
- **Test safety rule:** an end-to-end test must confirm it's on its own new record before it types anything, and must never touch existing rows.

**Previously shipped:** Wind Down one-click completion on every open task row, and media title autocomplete from earlier logs. The Friday review rebuilt (look back, act, the life week). The Command Center (attention band, day flow, UP NEXT as real task rows, live hub grid). The life module: journal, habits, media log, and body metrics inside the rituals.

**Open questions and ideas, not built yet:**
- **Untethered time.** Time spent on something that isn't a task, like a phone call. Today it can be captured as an entry with billed tenths, but a running clock needs a task. Option: make `time_sessions.task_id` nullable and add `matter_id` plus a label.
- **A captain's log by matter.** Running commentary, decisions, and status points tied to a case. The capture ledger (`entries`, kind `log`) already stores them. What may be missing is a per-matter log view and a way to mark *decisions* separately from passing notes.
- **MITs carry no date.** The flag persists until cleared. Check whether Start of Day resets it before deciding whether a date-scoped field is needed.
- **Dedicated habit and workout databases** are planned. Today's `habit_checks` and `body_metrics` are the interim capture layer, so future schemas should import from them.
- **Unbuilt hubs** (see Placeholders above).
- **The tweak list** project ("AB HQ") still needs to be created in the app.
