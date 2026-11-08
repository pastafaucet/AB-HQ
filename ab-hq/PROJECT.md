# AB HQ — Project Guide

The standing context for every work session on AB HQ, local or online. Read this first. Keep it current: the **Where we left off** section at the bottom is updated at the end of every session and committed with the code.

AB HQ ("Andy's HQ") is a personal operating system for one user: Andy Baum, an equity partner who runs a litigation practice of 70+ active matters. He is the only user and the product owner. It is the system of record for his tasks, cases, time, and daily rituals. **It is not a front end for Notion.** A Notion-as-the-store direction was explored in 2026-09 and dropped.

---

## How we work

**Cadence.** Build a batch, Andy lives with it, he comes back weeks later with tweaks. Sessions are spaced out, so nothing depends on anyone remembering the last one.

**Restarting a session.** When Andy says "let's pick up AB HQ":
1. Read this guide.
2. Run `git log --oneline -30` to see what actually shipped.
3. Read the wants list (below).
4. Tell Andy where things stand and what's queued *before* touching code.

**The wants list.** Andy keeps one pinned note in the app, **"AB HQ — Wants & Ideas"** (tagged `#ab-hq`, domain Personal, id `4e167129-eea2-49f6-b25e-f1d441fd63c6`), with three sections: **Want** (a checklist of decided items), **Thinking about** (ideas with context, maybe screenshots), and **Shipped** (dated, checked). Read it from `notes.body` in Supabase project `eyqfdjmkkrfxfiahoozs`. Other notes tagged `#ab-hq` are longer thinking on a single idea. If database access isn't connected, ask Andy to paste it.
- **Don't edit the note while Andy might have it open.** The editor saves the whole note at once, so his next keystroke would overwrite a change made from outside. At the end of a session, tell him what to move to Shipped, or update it only after he confirms the note is closed.
- Housekeeping and developer chores belong in **Where we left off** below, not in his note.

**Ending a session.** Update **Where we left off**, then commit and push it with the code. If the session shipped a feature or settled a decision, update `BRIEF.md` too. It's the project overview Andy's web Claude project reads (the vision, what's built, the roadmap, the settled decisions, the design reference).

---

## Standing rules

- **Andy tests on the live site** (https://ab-hq.vercel.app), never a local dev server. Once a feature builds cleanly, commit and push. Uncommitted work is invisible to him.
- **Deploys are push-to-deploy.** Pushing `main` builds on Vercel. After every push, run `npx vercel ls` and confirm the new deployment reads **Ready** before saying it's live. A local `next build` can pass on a stale type-check cache: `rm tsconfig.tsbuildinfo` before the final verification build. Failed deploy logs: `npx vercel inspect --logs <url>`.
- **Migrations are manual.** Andy pastes each `supabase/migrations/NNNN_*.sql` into the Supabase SQL Editor himself, often *after* the deploy is live. So:
  - write migrations idempotent (safe to re-run);
  - make code tolerate the pre-migration schema (pattern: `selectTaskRows()` in `lib/task-map.ts`, the `needsMigration` flag in `getProjectsPageData`). A deploy that queries a missing column takes down every page that shares the query, not just the new one;
  - tell Andy up front that a migration is a blocking step, and paste the SQL into the chat.
  - **Applied:** 0001–0016 (0016, `tasks.end_date` and `end_time`, confirmed 2026-11-06). **0017** applied 2026-11-07 (time entry: aliases, audit log, lock, `entries.routed_by` 'hours'). Applied: 0001–0017.
- **Next.js 16 is not the Next.js in training data.** Read `node_modules/next/dist/docs/` before using an unfamiliar API. `params` and `searchParams` are Promises.
- **Secrets** live in `ab-hq/.env.local` (gitignored) and in Vercel env vars. Never commit them. Vars: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (a new-style `sb_secret_…` key), `APP_PASSWORD`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`. Sensitive vars target production + preview only (Vercel won't allow `development`).
- **Code hygiene Andy cares about:** reuse shared primitives, keep separation of concerns, aim for components under ~300 lines. Several screens are over that now; split them when you're already working in them, not as a drive-by.
- **AB HQ is the one system for entry and viewing** (decided Nov 2026, replacing the 2026-10-18 rule that Notion was the home of meeting notes). Notion is retired object by object, with no double entry. Meetings can be pasted into AB HQ from any recorder; the Notion import is one option. When a meeting comes from Notion, Notion still holds the recording and transcript. The meeting-note format: One Note per meeting, tagged `#meeting` and linked to the case, titled `YYYY-MM-DD · <meeting title>`, with sections for Summary, Key points, Decisions, Action items, Attendees, and a link to the Notion page, then **the full transcript in a collapsible (details) block**. Andy wants the actual conversation for context and search. The import is keyed by the Notion page URL, so re-importing refreshes the same note. Action items are proposed as tasks and decisions as case-log entries, for Andy to approve. Claude drives the import through the connector's `save_meeting`, which fetches the full record with the read-only `NOTION_TOKEN` (see Core behaviors).
- **Hours** (built 2026-11-08, LIVE on the real sheet since 2026-11-07 PT): the record is the Google Sheet "2021 AB Daily Hours" (owner andybaum@gmail.com; live id `1bYUEgVJfO6nzMYEmvrGG-xXmGk4TO0WCy14EM6bm_u4`, test copy `1T2Kdj4bDFoUZSogaxkYiFwoVBE2Cg8LOyOuZNS-FmpM`). A capture holding a time in parentheses is a **time entry** and goes to the sheet; everything else in Capture is unchanged. Andy's spec is the rulebook (parser rules, write procedure, NEVER list); it's encoded in:
  - `lib/time-entry.ts`: pure parser (matter resolution order: `time_entry_aliases` → exact Clients name → Clients!D aliases → part after the slash; Active preferred; never guess). Questions instead of guesses: unknown/ambiguous matter, bare integer "(4)", not a clean increment (Clients!C), stated total vs. task sum, a task without a time, a suspicious date. Description: Andy's words, first letter capitalized, stray double capitals fixed ("PRepare"), obvious typos corrected by `lib/typo-fix.ts` (Claude proposes word-level fixes; code accepts only single plain words, edit distance ≤ 2, present in the text, no acronyms) and every correction reported to Andy ("Corrected: plaintffs → plaintiffs"); a description Andy types on the confirm card is left as typed; one task → no parens, several → every time kept as `(.4)`, RS/General → no per-task times. Unit tests: `npm run test:time` (his six real inputs plus edge cases).
  - `lib/google-sheets.ts`: service-account client (self-signed JWT, no library). Env: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (Production only, set by Andy), `HOURS_SHEET_ID` (Production + Preview, currently the TEST copy). Switching to live = change `HOURS_SHEET_ID` and share the live sheet with the service account as Editor.
  - `lib/hours-sheet.ts`: the write procedure, one entry at a time under a Supabase row lock (`time_entry_lock`): write I1:I4 `[[date],[null],[null],[client]]`, read I2 (`ACTION|ROW|INHERIT|NOTE`), MERGE (re-read; add D; append F with times) / APPEND / INSERT (`insertDimension`, inheritFromBefore for BEFORE) with re-read checks and up to three restarts, read back B:H (G must be Billable/Non-billable; H flags shown word for word), clear I1/I4 in `finally`. Undo and edit find the row again by date + client + description (case-insensitive client, as Sheets compares). Writes only B, C, D, F (+ I1, I4); E/G/H are skipped with null. Every write is audited in `time_entry_log`; its row numbers are never reused.
  - `app/(app)/hours-actions.ts` (`captureTime`, `confirmTimeEntry`, `undoTimeEntry`, `editTimeEntry`, `addHoursClient`), called from `captureEntry`. The raw capture is still kept in `entries` (`routed_by: 'hours'`, no tenths, so nothing double-counts). The connector's `capture` tool returns logged lines and the lines that need Andy.
  - **Clients are never hard-coded:** every capture reads Clients!A2:E300 live (name, Billable/Non-billable, increment, "Also typed as", Active). The only stored list is `time_entry_aliases` (Andy's shorthand → a Clients name, seeded with the nine from his spec); an alias pointing at a name not on the Clients tab is ignored and the card asks.
  - UI: the ⌘K box shows "time entry → hours sheet" while typing; logged lines show "Logged Wed 11/4 | COLA/Does | 1.3 | … Today: 3.35 billable." with Undo; uncertain lines become a confirm card (matter picker, date, hours, increment and bare-integer choices, editable description, "remember as alias", "new matter" → Clients row A/B/C/E). Work → Time is now only the sheet's view: the B3/C3/F3 strip, the selected day's rows and flags, and a **month calendar** in the rail (`HoursCalendar`: each day's billable and non-billable totals from the same single read of the sheet, prev/next month via `?month=`, click a day for `?date=`). **Each row has Edit** (date, matter, hours, description; increment checked against Clients!C): same date and matter → D/F change in place; a new date or matter → logged fresh through the normal write procedure, then the old row's B/C/D/F cleared (in that order, so a failure duplicates rather than loses time); **Remove** clears B/C/D/F (rows are never deleted). Entered rows warn that Lara must fix the firm system. Edits are written as typed (no typo correction). **Retired 2026-11-08 (Andy):** the old day ledger, `getDayLedgerData`, and the AI billing-narrative drafts (`billing-actions.ts`) on Time and Wind Down; Wind Down now points to Work → Time.
  - Self-test: `/work/time/selftest` (APPEND, MERGE, INSERT into an earlier day, Undo each); refuses to run if `HOURS_SHEET_ID` is the live sheet.
  - **Not built yet from the spec:** the connector's dedicated `log_time` tool (its `capture` tool covers it).
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

Five destinations, each one page with tabs (`lib/nav.ts`; Nov 2026). The sidebar lists the destinations; `TabBar` shows the current one's tabs. A tab with `built: false` is hidden, and a destination with no built tabs (Life, for now) is hidden too. Old URLs (`/my-day`, `/hub/*`, and so on) redirect permanently in `next.config.ts`.

**HQ**
- **Command Center** (`/`, `CommandCenterClient`): an attention band, "The day" flow, UP NEXT (real task rows that open the drawer), and a live hub grid. Rings band planned (step 2).

**Plan**
- **Today** (`/plan/today`): one page, three modes, switched by `TodayModeSwitch` (`?mode=start|today|wind`). With no `?mode`, the clock picks: before 11am Start of Day, from 6pm Wind Down, Today otherwise (`lib/today-mode.ts`). A mode picked by hand sticks for the rest of that time band (cookie `abhq_today_mode`). Locking in MITs moves to Today mode.
  - **Start of Day** (`start-mode.tsx`, `StartUpClient`): "On tap from yesterday," overdue and due-today triage, project obligations this week, the morning-body check-in, the morning routine, and the **MIT picker**.
  - **Today** (`today-mode.tsx`, `MyDayClient`): quick-add, the protected Top 3 (MITs), Also Today, In Progress. The right rail has the capacity bar and the schedule grid.
  - **Wind Down** (`wind-mode.tsx`, `WindDownClient`): close out open tasks with one click, "On tap for tomorrow," the journal, habits, body metrics, the media log, and "A year ago today."
- **Week** (`/plan/week`, `WeeklyClient`): the Friday review. The week that was, tasks done, captures, matters touched, matters with no next action, billed time entered, and the life week.
- Month and Year: not built (step 5). The monthly review will live in Month; Calendar folds into Month and Year.

**Work**
- **Inbox** (`/work/inbox`): the capture ledger's inbox. Entries the AI router couldn't confidently file wait here.
- **Tasks** (`/work/tasks`): the full task hub, including a calendar view.
- **Projects** (`/work/projects`): projects as entities, with a terminal deadline, a matter link, and a drawer.
- **Cases** (`/work/cases`): matters, with lifecycle (disposition, closed date) and people.
- **Time** (`/work/time`): the hours Google Sheet's view of a day, a month calendar with daily totals, and Edit / Remove per row (see Hours under Standing rules).

**Notes**
- **Notes** (`/notes`): rich text (Tiptap) with links, @mentions, pins, tags, Inbox/Active/Archived status, search (AND terms, quoted phrases), and images (paste, drop, or the ▣ Image button; drag a bottom corner to resize). Knowledge hub and Tag list fold in here.
- **People** (`/notes/people`): contacts linked to matters.

**Life** (hidden until built): Goals (step 4), Habits (step 6), Journal, Health. Habits, journal, and body metrics are captured inside the rituals today. Scuba, 3D Printing, Games, and hockey are **life areas** with their own dashboards and records, to come after the planning layer. They are not projects.

**Shell** (`AppShell.tsx`): sidebar of destinations, header with the **All / Work / Personal** toggle, capture field, clock. The toggle is stored in cookie `abhq_scope` (`lib/scope.ts`, read server-side by `lib/scope-server.ts`). Pages pass it to their query (`getMyDayData`, `getStartUpData`, `getWindDownData`, `getTasksPageData`, `getCommandCenterData` take a `scope` argument, default `"all"`, filtering task rows by `domain`) and key the client component by scope, so a flip remounts the screen with fresh data. **Not yet filtered:** Week, Projects (no domain column), Notes, People, Inbox, Time. The MIT cap still counts across both domains.

**Mobile** (below 900px, `MobileBar.tsx`): the sidebar hides; a bottom bar of Today, Capture, Tasks, Cases, More (a sheet with the rest). Pane and rail stack and the whole screen scrolls; drawers go full width.

---

## Core behaviors worth knowing

- **Tasks:** type is Task / Event / Deadline. Priority is P1–P4 (red / green / yellow / gray). Domain is Work / Personal. One `do_date` plus an optional `do_time`; multi-day items (trips, trial weeks) add `end_date` and optional `end_time` (0016). `lib/task-dates.ts` holds the span rules: an item counts on every day it covers (`coversDay`) and is overdue only after its last day (`isPastDue`). On a single day, the drawer's end time just sets `duration_min`. Then `duration_min` as the estimate, matter and project as **separate** fields, `waiting_on`, notes, and recurrence.
- **MITs:** a plain `tasks.mit` flag, capped at **3** server-side (`MIT_CAP` in `task-actions.ts`). Start of Day is where they get picked.
- **The schedule shows Events only.** An item appears on the grid only if it is an Event with a time on today's date. Timed *tasks* stay in the lists. Drag to reschedule, drag from a list onto the grid, resize from the bottom edge. Everything snaps to 15 minutes. With no estimate, a block is 15 minutes.
- **Capacity** counts only explicit estimates (`duration_min` set). Events with no estimate add nothing. It's computed from the whole Today set, not just items dated today.
- **Timers:** `time_sessions` (one running at a time, survives refresh and other devices). Sessions are editable in the task drawer: start, end, date, note, delete, and manual add. **A session must belong to a task.**
- **Activity log:** `task_activity` auto-records creation, priority and status changes, moves to today, MIT changes, and completion.
- **Recurrence:** completing a recurring task spawns the next one. Rules are JSON on `tasks.recur` (`lib/recur.ts`): daily, weekly, monthly, yearly, the nth weekday, the last workday.
- **The capture ledger** (`entries`): ⌘K is the single capture box. The raw text is kept forever. AI routing (`lib/route-entry.ts`) classifies the entry as a log, task, note, or event, matches a matter or project, pulls out dates and delegation, and drafts a one-line summary. A task created from an entry links back to it. Billed time rides along as `billed_tenths`.
- **Note images:** stored in the **private** Supabase Storage bucket `note-images` (25 MB cap; PNG/JPEG/GIF/WebP). The browser uploads straight to storage through a one-time signed URL from `startNoteImageUpload`, which avoids Vercel's ~4.5 MB request limit. Notes reference `/api/note-images/<uuid>`, which serves only behind the passcode by redirecting to a short-lived signed URL. **That address must never end in a file extension**: the middleware skips auth for paths ending in `.png`/`.jpg` and similar. A paste that also carries text (from Word or a web page) uses the editor's normal rich paste, so the words aren't lost.
- **Editor JSON must be plain objects before it's saved.** ProseMirror builds node attributes as null-prototype objects, and the server-action encoder silently drops them. `NoteEditor` round-trips `getJSON()` through `JSON.stringify` for this reason. Before 2026-10-18 every saved note lost its node attributes (mention ids, task checkmarks, list start numbers).
- **The Claude connector** (trial, read-only, shipped 2026-10-18). AB HQ is a remote MCP server at `/api/mcp` that Andy adds in claude.ai (Customize → Connectors), so Claude, on *his own subscription*, works on phone, desktop, and web. **Never** run the app's own features on his subscription credentials: Anthropic's terms restrict subscription sign-in to Anthropic's apps. Anything inside AB HQ's own screens uses the API key.
  - Reads live in `lib/assistant-tools.ts` (shared with the future in-app chat): `get_today`, `list_open_tasks`, `list_cases`, `get_case`, `search_notes`, `get_note`. They're marked read-only, so Claude runs them without prompting.
  - Writes live in `lib/assistant-writes.ts` (since 0.2.0): `add_tasks` (a batch of up to 25 in one approval), `update_task`, `capture` (exactly ⌘K: verbatim entry, AI routing, tenths into the day ledger), and `save_meeting`. They reuse the app's own server actions (`createTask`, `updateTask`, `captureEntry`, `addTagToNote`, `addNoteLink`), so the MIT cap, activity log, and recurrence all apply. They need the `abhq.write` scope; consent now grants read and write. A connection approved before 0.2.0 is read-only, and the tools tell Claude to have Andy disconnect and reconnect.
  - **`save_meeting`**: Claude passes the Notion link plus its own summary, decisions, action items, key points, and attendees. AB HQ fetches the full record itself (`GET https://api.notion.com/v1/pages/{id}/markdown?include_transcript=true`, `Notion-Version: 2026-03-11`, env `NOTION_TOKEN` from a read-only internal integration with access to the Meeting Notes database), so Claude never retypes a 45 KB+ transcript. The record goes in a collapsed details block. Notes are deduped by the Notion id appearing in the note body, and the match covers both the meeting-notes block id and its parent page id (resolved via `GET /v1/blocks/{id}`).
  - **claude.ai caches a connector's tool list from when it was connected.** After adding or renaming tools, Andy must disconnect and reconnect AB HQ, or Claude keeps seeing the old list.
  - **Claude speaks MCP 2026-07-28** (`server/discover`, per-request `_meta` envelope) and opens `subscriptions/listen` streams. These ran to the function time cap and reopened every minute, so `maxSubscriptions: 0` now refuses them up front (deployed 2026-10-18; confirm in logs on Claude's next session that listen returns immediately). The route logs each MCP method name (`mcp tools/call:<name> pv=…`). Read logs with `npx vercel logs --since 30m --json --non-interactive --no-branch`; without `--no-branch`, CLI-made deployments are filtered out.
  - **Meetings outside the Meeting Notes database are invisible** to the Notion connection (as of 2026-10-18 it only has access to that database). The 10/05 "CoCo AB 218 Group C" meeting is one; its note saved without the conversation. Fix: share the page (or the whole Notion "AB HQ" page) with the connection, then re-run `save_meeting`.
  - **Claude can bypass AB HQ through the Supabase connector** on Andy's claude.ai account. On 2026-10-18, with only read tools visible, it wrote four meeting notes straight into `notes` via SQL: no `#meeting` tag, status Inbox, and no conversation. Andy was advised to add a profile preference ("only change AB HQ through the AB HQ connector") and to block Supabase `execute_sql` in claude.ai. Those four notes get repaired in place by re-running `save_meeting`. `NOTION_TOKEN` is set (2026-10-18) in `.env.local` and Vercel **Production only**. The CLI wouldn't take the Preview variant non-interactively; add it in the dashboard if preview deploys are ever used. It comes from the Notion connection "AB HQ" (Developer tools → Connections), read-content only, with page access to the **Meeting Notes** database. Verified: the endpoint accepts the meeting-notes *block* id from claude.ai links and returns `<meeting-notes><summary>…</summary><notes>…</notes><transcript>…</transcript></meeting-notes>`; a 35-minute call is about 56 KB. The importer renders those three parts as "Notion's summary / Your notes / Conversation" inside the collapsed block. `next.config.ts` raises `serverActions.bodySizeLimit` to 4 MB, because the editor autosaves the whole note and big transcripts exceeded the 1 MB default.
  - Decisions stay inside the meeting note for now. A separate decision log needs a small migration, because the billing day ledger (`getDayLedgerData`) includes *every* non-dismissed entry, so decision entries would leak into billing drafts.
  - Sign-in is a minimal OAuth 2.1 server in `lib/oauth.ts`. It's stateless, with HMAC-signed client ids, codes, and tokens keyed off `SESSION_SECRET` plus an `:oauth` suffix, so no tables. It supports DCR and CIMD and requires PKCE S256. Redirects are limited to `https://claude.ai/api/mcp/auth_callback` or loopback. Access tokens last 1 hour and refresh tokens 90 days. The consent page `/oauth/authorize` is behind the passcode; the login page honors `?next=` for same-site paths only.
  - Public, machine-only paths that skip the passcode gate in `middleware.ts`: `/api/mcp`, `/oauth/token`, `/oauth/register`, `/.well-known/oauth-*`.
  - **To disconnect every client at once:** set or bump the `MCP_TOKEN_VERSION` env var on Vercel (default `"1"`) and redeploy.
  - Next: `log_time` to the Google Sheet (see Hours), then the decision log.
- **Billing:** captures and tracked timer time roll up into one line per matter in Andy's house format, `activity (.4); activity (.2)`. Minutes round up to tenths. Unknown time renders as `(.__)` to fill in. AI drafts are a starting point, always reviewed by Andy.

## Quick-add syntax (`lib/quick-parse.ts`)

The same parser runs in Today's quick-add, the Tasks hub, and ⌘K. An empty focused box shows this cheat line:

`hearing Theberge 10/30 at 9:30` · `oppo due friday p1` · `every tuesday` · `2nd tuesday of the month` · `~2h` `~30m` = estimate · `2-3:30pm` · `#personal` (parentheses are billed time, Capture only: `AB 218 - review memo (.4)`)

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
- **Five destinations with tabs; unbuilt hubs hidden** (Nov 2026). This reversed the earlier rule that the full hub layout stays in the sidebar. The 22-item sidebar was too fragmented.
- **The planning layer is in scope** (Nov 2026): year, month, and week views, goals, habits, progress rings, all from one period engine (`lib/progress.ts`, planned). This replaced "year-at-a-glance is out of scope for V1."
- **Drawers are the standard:** any linked item opens in a side drawer over the current page. ⌘J jumps to anything; ⌘K stays capture.
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

*Updated 2026-11-06.*

**This session (2026-11-06): step 1 of the planning-layer plan, first half.** Andy set six decisions (recorded above and in `BRIEF.md`) and a seven-step build order. Shipped in one push to `main` (`63ed9ec`): the five-destination nav with tabs, unbuilt hubs hidden, Today's three modes, the All / Work / Personal toggle filtering tasks, and the mobile bottom bar. Verified: clean build, and a local render of the new shell at desktop and phone width with a throwaway page (no live data; this sandbox can't reach Supabase or the live site). **Not verified:** the Vercel deploy reading Ready. The Vercel connector needed Andy to approve team access, and `npx vercel` isn't logged in here. **Not exercised against real data:** the Today mode switch, the scope toggle, and the redirects on the live site. Andy tests them live.

**Step 1, second half: shipped 2026-11-07.** Drawers, ⌘J, cross-links. How it works:
- **Drawer bus** (`app/components/drawers/bus.ts`): `openDrawer(kind, id)` from anywhere; `emitChange` on every drawer edit; list screens subscribe with `useDrawerChanges` + `applyChange`, so a drawer opened over a page never leaves it stale. `useEscapeClose` replaces each drawer's own Escape listener: only the most recently mounted drawer closes (host drawers stack over page drawers).
- **DrawerHost** (in `AppShell`): a stack; every open drawer stays mounted, only the top shows, closing returns to the one beneath. Host scrims sit at z-index 60 over page drawers (50). Loaders in `app/(app)/drawer-actions.ts` reuse each hub's query and pick the one row (`getNotesPageData(noteId)` loads one note; `getTaskDrawerData(id)` is new).
- **Containers** own loading and saving: `CaseDrawerContainer`, `PersonDrawerContainer`, `ProjectDrawerContainer` (now also used by the Cases, People and Projects hubs, which lost their duplicated wiring), `TaskDrawerContainer` and `NoteDrawerContainer` (host only for now). **The six task screens still wire their own task drawers**; move each onto `TaskDrawerContainer` when it's next reworked.
- **⌘J** (`JumpPalette`): title search across matters (name, client), projects, open tasks plus tasks done in the last 60 days, titled notes, and people (name, org); titles starting with the query rank first. ↵ opens the drawer, ⌘↵ goes to the home page. Header button "Jump ⌘J"; on the phone, "Search everything" in More.
- **Cross-links:** case drawer people → person; person drawer cases → case; project drawer task titles → task; task drawer "open ↗" next to MATTER → case; case/person notes and new notes → note drawer (no more navigating to /notes); @mentions and link chips in notes → their item.
- Verified locally: build clean, no new lint errors (32 pre-existing in the task screens/NoteEditor), drawer stacking and Esc order, ⌘J open/close with no page errors. **Not verified locally:** anything that loads data (sandbox can't reach Supabase); Andy tests on the live site.

**Answers from Andy this session:** rituals switch automatically by time of day, but he wants to pick any mode at any time (done: the switch is always visible). The toggle should really filter (done for tasks). Deploy from `main`. Scuba, 3D Printing, and Games are life areas with dashboards and databases, not projects; they wait.

**Later the same day (2026-11-06):**
- Capture bug: "Tuesday AB 218 work on Brown Greer Slater Fact Sheets p1" was routed as a log, so no task was made. Fixed (`98d35a6`): an explicit p1–p4 forces a task, the deterministic parser fills a dropped date/time/priority, and the routing prompt describes Andy's fragment style. Andy re-entered the task himself.
- Tasks calendar chips now take their left edge from priority (`PRI_COLOR`, now shared from `lib/data.ts` instead of four copies); type shows as a small ◆ (deadline) or ● (event) marker.
- The capture toast says when the All/Work/Personal toggle hides what was just created ("Personal, hidden while Work is on").
- HQ cards renamed to Start of Day and Inbox.
- **End date and time, built early** (Andy asked): migration 0016, the drawer's ENDS row (`EndsField.tsx`), calendar chips on every covered day (later days show ↳, dragging moves the whole span), Today/Start of Day/HQ/Tasks views treat a span as current until its last day, ⌘K extracts ranges, recurring spans keep their length. Not yet: the quick-add parser (Today/Tasks boxes) doesn't read ranges like "11/6 - 11/9" (⌘K does), the Claude connector's `add_tasks`/`update_task` have no end fields, and the schedule grid ignores spans. 0016 is applied.
- Task drawer: the Mark complete / Delete bar is pinned to the bottom (sticky `.mark-footer`), since the ENDS row made the drawer long enough to need a scroll.
- Task drawer: REPEATS and ESTIMATE share one row, with one combined hint below (Andy asked).
- Estimate select shows any non-standard length (e.g. 7h from a same-day end time) as its own option so it can be cleared; making an item multi-day clears `duration_min` so a trip doesn't count toward capacity (`e25e2a4`).
- Bug fixed: typing an end date digit by digit cleared the field (the year passes through 0002, which is before the start date, and the field rejected it mid-typing). `EndsField` now holds a local draft while focused and commits only plausible, complete values. Verified locally: the old code died at "0002-11-09"; the new code commits 2026-11-09 and the chip spans four days.
- **Roll-up of per-plaintiff matters: Andy said hold off** (2026-11-06). Was asked: whether the per-plaintiff COLA AB 218 matters should roll up under one coordinated matter. 70 of 73 cases show as "gone silent" because individual plaintiffs are never touched one by one.

**2026-11-08: time entry to the hours sheet** (Andy's spec, ahead of step 2). **Migration 0017 applied** and the **end-to-end self-test passed on the test copy** (2026-11-07 16:31 PT, verified by reading the sheet and `time_entry_log`): APPEND today at row 3044 (G Non-billable, H blank); MERGE into the same row (D 0.50, F "… (.25); … (.25)"); INSERT for 11/6 at row 3044, which pushed today's row to 3045; Undo of each found the rows again after the shift (3044, 3045, 3045) and restored/cleared them. Afterward I1/I4 were empty, I3 back to 3044, the lock released. As designed, the INSERT left one blank row in the test copy (rows are never deleted). Not yet exercised end-to-end: typo correction and the confirm card. **LIVE since 2026-11-07** (Andy: "go live"): the live sheet is shared with `ab-hq-hours@ab-hq-514023.iam.gserviceaccount.com` as Editor and `HOURS_SHEET_ID` is the live id (Production + Preview). Env changes take effect on the next deploy. To test changes safely, point `HOURS_SHEET_ID` back at the test copy (the self-test page only runs there). Andy went live without the suggested real-use tests, so the first real captures are the first live check of typo correction and the confirm card. Flagged to Andy: the live sheet's link sharing is "anyone with the link can edit". Andy's answers (2026-11-08): "timesheets in AB218" meant AB HQ's Time tab, which is now the sheet's view; the raw capture stays in the ledger; **parentheses mean billed time and "~" means an estimate everywhere** (quick-add no longer reads "(1)" or "(30m)" as estimates); correct obvious typos and tell him what changed. **2026-11-07 evening, first live use:** 12 real entries logged correctly (merges, inserts into 11/3, a typo fix "opposign → opposing", aliases and card confirmations all worked). **Bug:** Andy typed "11/4" on its own line above three entries; the parser read each line alone, so they landed on Sat 11/7. Moved by hand (Sheets connector, following the write procedure under the app's lock, recorded in `time_entry_log`): COLA/Does 4.7 merged into the 11/4 COLA/Does row (now 7.30), COLA/Herrera 0.2 and GW/Business Dev. 2.25 inserted on 11/4; the three 11/7 rows cleared. **Fixed:** a date-only line now sets the date for the lines below (an entry's own leading date still wins), and a known matter at the start of a line without a dash ("Cedars/Huntington emails from …") is recognized by exact rules only. Tests: 18. **Flagged, not changed:** the 11/3 Cedars/Huntington row's description starts with "Cedars/Huntington emails from Elspeth…" (the matter name crept into the bill text before this fix).

**Known side effect:** HQ's Time card and the Friday review's "billed time entered" read entry tenths, which time entries no longer carry; point them at the sheet when next touched. **Step 2 (rings) is next after this**, with four questions already asked (week start, events in the ring, billed-hours ring target, removing the HUBS grid).

**Still to ask before steps 3–5:** goal areas; numeric targets vs. "done when its projects are done"; rolling 12 months vs. calendar year; quarterly goals.

**Flagged to Andy:** his claude.ai skill `ab-hq-notion` calls itself the "Gateway to Andy's AB HQ system in Notion." That conflicts with AB HQ as the one system, and it could steer Claude to write tasks into Notion. It lives in his claude.ai account, not this repo.

**Previous session (2026-10-18):** Added this guide. Notes accept pasted, dropped, and picked images, resizable and private. Fixed three notes bugs found while testing: (1) clicking "+ Note" left the old note editable until the new one arrived, so a fast title went onto the old note; (2) editing one note and switching to another within 600 ms dropped the first note's last edit; (3) the save step stripped every node attribute (see Core behaviors).

Also this session: the **Claude connector** (see Core behaviors). The read-only version passed 22 local checks and then Andy's real first use ("Give me the rundown on COLA AB 218", which combined AB HQ with Notion meeting notes; he was "blown away"). The write actions (0.2.0) passed 14 local checks. Test rows were cleaned up through product states: the task was cancelled, the capture dismissed, and the "QA test · Notion webinar" note archived. **Andy must disconnect and reconnect AB HQ in claude.ai to get write access, and set up `NOTION_TOKEN`** (instructions were given in chat: a read-only internal integration connected to the Meeting Notes Database page).

**Data fixes Claude flagged in that rundown (not yet done):** the immunity-motion project deadline (10/31) is before the 11/4 reply and the 11/12 hearing; Rob Lee is listed as opposing counsel; the "plaintiffs' Group C proposal" task looks answered; seven meeting action items aren't in AB HQ. The "ZZ paste test" note is Andy's **BrownGreer call notes**. The suggested title is "2026-09-02 - BrownGreer call", waiting on Andy's confirmation.

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
- The ideas above are also in Andy's wants note under "Thinking about"; treat the note as the current version.
