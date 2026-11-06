# AB HQ — Project Brief

*For Claude working with Andy on the web: what we're building, why, where it stands, where it's going, and how it looks. Last updated 2026-10-18.*

---

## Read this first: how we work together

Andy works with two Claudes on this project, and they have different jobs.

- **You (Claude on the web) are for thinking and designing.** Explore layouts, make mockups, talk through how a feature should behave, react to screenshots. Your output is a **mockup Andy likes plus a short spec**: what changes, on which screen, and why. You don't write production code and you don't decide that something is shipped.
- **Claude Code (in VS Code on Andy's Mac) builds and ships.** It works in the real codebase, tests against the live database, and deploys. Andy carries your mockup and spec over to it.
- **The source of truth is the GitHub repo**, specifically this brief and `ab-hq/PROJECT.md` (the technical guide). If this brief and the live app disagree, the app wins. Ask Andy or check the code.
- **Ideas and tweaks go on one list, in the app itself:** a pinned note called **"AB HQ — Wants & Ideas"**, with sections for Want, Thinking about, and Shipped. Don't keep a second running to-do list in this chat. When a conversation here produces something to build, Andy adds it to that note. If you need its current contents, ask Andy to paste them; it lives in the app, not in GitHub.

**When you make a mockup:**
- Use the real design system (the Design reference section below, and `ab-hq/app/globals.css`). A pretty design in a different palette has to be translated back, which wastes the work.
- Show it as a working HTML page with realistic content: real-feeling matter names, real litigation vocabulary (MSJ, meet-and-confer, status conference, deposition outline, tenths of an hour).
- Say what's **new** and what's **existing**, so Claude Code knows what it's changing.
- Don't reopen the settled decisions listed below unless Andy raises them.

---

## What AB HQ is

AB HQ ("Andy's HQ") is a custom personal operating system for one person: **Andy Baum, an equity-partner litigator running 70+ active matters**, plus a full personal life. It's a web app he opens all day, on Windows at work, his Mac at home, and his phone.

It is the **daily-driver layer**. It is not a document store (Dropbox does that) and not a file room (iManage does that). It holds tasks, cases, time, notes, people, and the daily rituals that tie them together.

Andy is the only user, the product owner, and the person who tests every change on the live site (https://ab-hq.vercel.app).

## The problem it solves

Capturing things was never the hard part. **The daily ritual, processing, and retrieval were.** Earlier systems, Notion among them, stalled on over-scoping and on inboxes that never got processed.

AB HQ succeeds only if the daily loop is frictionless: **pick → do → review → roll over.** If that loop dies, the system gets abandoned. Every design decision is judged against it.

## Principles

- **Easy to get data in. Easy to get the right data out. Never overwhelming.** The right things surface at the right time, and everything else stays quiet.
- **Ship, don't fiddle.** The named risk on this project is tinkering forever, not quitting. Working screens beat cleaner abstractions.
- **Decide by reacting to real screens.** When something is unclear, make the smallest concrete version and show it. Andy decides faster from a mockup than from prose.
- **The look is load-bearing.** The aesthetic is part of why Andy uses it. Match the design system exactly; don't improvise colors.
- **Single user.** No teams, roles, sharing, or scale features.
- **Raw records are permanent.** What Andy captures is kept verbatim. AI routing annotates it and never rewrites it, because a bill may later rest on that record.
- **AI drafts are always reviewed.** The system turns time entry into editing instead of remembering. It never sends anything on Andy's behalf.

---

## Where it stands (built and live)

**Navigation (Nov 2026):** five destinations, each one page with tabs. **HQ** (Command Center) · **Plan** (Today, Week; Month and Year to come) · **Work** (Inbox, Tasks, Projects, Cases, Time) · **Notes** (Notes, People) · **Life** (Goals, Habits, Journal, Health; hidden until its first tab is built). Unbuilt tabs are hidden, not placeholders. On a phone, a bottom bar of five: Today, Capture, Tasks, Cases, More. The header's **All / Work / Personal** toggle filters tasks on Today, Tasks, and HQ.

**The daily loop, the heart of the app** (three modes of Plan → Today; the clock picks the mode, before 11am Start of Day, from 6pm Wind Down, and Andy can switch any time):
- **Start of Day** (morning ritual): "on tap from yesterday," overdue and due-today triage, project obligations this week, a morning body check-in, the morning routine, and the **MIT picker**, where Andy chooses today's three Most Important Tasks.
- **Today** (the all-day cockpit): quick-add, the protected Top 3, Also Today, In Progress. The right rail has a capacity bar and an interactive schedule: drag to reschedule, drag a task from a list onto the grid, resize, all in 15-minute steps. Task and event timers survive refreshes and work across devices.
- **Wind Down** (evening ritual): close out open tasks with one click, pick what's "on tap for tomorrow," write the journal ("top things of the day"), check habits, log body metrics and media (shows and movies watched, often with his wife), and see "a year ago today."

**Around the loop:**
- **Andy's HQ, the home screen (Command Center):** an attention band, the day's flow, UP NEXT (real task rows), and a live grid of hubs.
- **⌘K Capture:** one box for everything. Andy types naturally; AI classifies it (task, note, event, log), matches it to a case or project, pulls out dates and delegation, and drafts a one-line summary. Anything it can't confidently file waits in **Work → Inbox**.
- **Quick-add syntax** everywhere: `hearing Theberge 10/30 at 9:30` · `oppo due friday p1` · `every tuesday` · `(.5)` or `~2h` for estimates · `2-3:30pm` · `#personal`.
- **Tasks**, **Projects**, and **Cases** hubs, plus **People** linked to cases.
- **Time and billing:** a day ledger per matter, and AI first drafts of billing narratives in Andy's house format, `activity (.4); activity (.2)`, rounded up to tenths.
- **Weekly (the Friday review):** the week that was, tasks done, captures, matters touched, matters with no next action, billed time entered, and the life week.
- **Notes:** a rich-text editor with @mentions of cases and people, #tags, pins, an Inbox/Active/Archived lifecycle, search, and pasted or dropped images that can be resized.
- **Recurring tasks:** daily, weekly, monthly, the nth weekday of the month, the last workday.
- **AB HQ inside Claude:** a connector, so Claude on Andy's own subscription works with his real data on his phone, desktop, and the web. It can read today's plan, open tasks, cases, a case's full picture, and notes. With Andy's approval for each change, it can add tasks (several at once), update tasks, capture entries like ⌘K, and save Notion meetings into AB HQ with the full conversation attached. Time entry to the hours sheet comes next. A chat panel inside AB HQ's own screens is planned too; it has to run on a separate pay-per-use account, because a subscription can't power an app.

## Where it's going

None of this is committed or scheduled. It's the known horizon, roughly in the order things come up.

**The planning layer (in scope as of Nov 2026).** Year, month, and week views; goals; habits; progress rings. One engine, many lenses:
- `lib/progress.ts`: one function takes a date range (day, week, month, quarter, year) and returns task completion, habit completion, and goal progress. Every ring and bar uses it.
- Shared components in the existing tokens: Ring, ProgressBar, MonthGrid, YearStrip, PriorityGroup (P1–P4 colored stacks).
- One migration: a `goals` table (title, area, period, period_start, status; progress computed from linked projects and tasks); projects gain start_date, kind, horizon, goal_id; habits gain a weekly target and goal_id; a `reviews` table (period, period_start, reflection). (Tasks' optional end date and time for multi-day items shipped early, 2026-11-06, as migration 0016.)

**Build order:** (1) nav restructure, ⌘J jump-to-anything, standard drawers; (2) period engine, primitives, rings on HQ from existing data; (3) the migration; (4) Goals tab; (5) Year and Month tabs; (6) Habits tab; (7) monthly review. Step 1 is partly shipped (nav, tabs, Today modes, scope toggle, mobile bar); ⌘J and drawers are next.

**Still open:** goal areas (the planner used Finances, Career, Personal Growth, Health, Relationships, Home; a field on goals only); numeric goal targets vs. "done when its projects are done" for V1; Year view as rolling 12 months vs. calendar year; whether quarterly goals are wanted.

**Life areas.** Scuba, 3D Printing, and Games (and hockey) are areas of Andy's life, each with its own dashboard and records. They are not projects and not nav items yet; they wait until after the planning layer.

**Wants still outside the plan:** Claude chat inside the app, time entry writing to the hours sheet, Harvey email summaries, Superhuman for personal email, a financial picture.

**Open ideas:**
- **Focus Items:** a *weekly* intent layer across 3–5 active projects, shown on the Weekly review and as a small read-only strip on Today. It is deliberately separate from the daily Top 3: week versus day.
- **A captain's log per case:** a running commentary of decisions and status points tied to a matter. The capture ledger already stores these entries. What's missing is a per-matter view and a way to mark *decisions* apart from passing notes.
- **Untethered time:** time that isn't tied to a task, like a phone call. It can be captured today with tenths (`call w/ OC re Henderson (.3)`), but a running timer still needs a task.
- **MITs and dates:** the MIT flag carries no date. Check whether "today's three" needs to be scoped to a specific day.
- **Dedicated habit and workout tracking**, built on top of what the rituals already capture.

---

## Settled decisions (don't reopen unless Andy does)

- **AB HQ is the one system for entry and viewing** (Nov 2026, replacing the 2026-10-18 carve-out for meeting notes). Notion is retired object by object, with no double entry. Meetings can be pasted into AB HQ from any recorder; the Notion import is one option among several. A move to Notion as the store was explored in September 2026 and dropped. When a meeting comes from Notion, Notion still holds the recording and transcript. AB HQ gets each meeting's substance for context: the date, title, attendees, and case, a summary and key points, decisions, action items, a link to the Notion meeting, and **the full conversation** in a collapsible section (Andy finds the actual discussion valuable, and it makes what was said searchable). It's stored as a Note tagged #meeting, linked to the case, one per meeting, refreshed on re-import rather than duplicated. On import, action items are proposed as tasks and decisions as case-log entries, for Andy to approve. If the two disagree on what was said, Notion wins. Claude does the importing, not a direct AB HQ–Notion integration. Old non-meeting Notion pages are an archive; old Notion tasks are never current.
- **Priority is P1–P4.** No Eisenhower important/urgent.
- **Domains are Work and Personal only.** No Health domain; health is a hub, not a domain.
- **One date per task** (the do date) plus an optional time. Deadlines are a task *type*, not a second date field.
- **Matter and project are separate fields.** A project can sit under a case or stand alone.
- **Only Events go on the schedule.** Timed tasks stay in the lists.
- **Estimates are never invented.** Capacity counts only estimates Andy enters. An unestimated block shows as 15 minutes.
- **No Outlook integration.** The firm has locked down calendar publishing and app registration, so events are entered manually.
- **Names follow the original prototype:** "Andy's HQ," "Start of Day," "Today," "Wind Down."
- **The planning layer is in scope** (Nov 2026). This replaces "year-at-a-glance is out of scope for V1."
- **Five destinations, each one page with tabs** (Nov 2026): HQ, Plan, Work, Notes, Life. Start of Day and Wind Down are modes inside Today; the weekly review lives in Week, the monthly review in Month; Calendar folds into Month and Year; Knowledge hub and Tag list fold into Notes.
- **Unbuilt hubs are hidden** (Nov 2026). This reverses "the full hub layout stays in the sidebar."
- **Drawers are the standard:** any linked item opens in a side drawer over the current page. **⌘J** jumps to anything (cases, projects, tasks, notes, people); **⌘K** stays the capture box.
- **Mobile:** a bottom bar of five: Today, Capture, Tasks, Cases, More.

---

## Design reference

The signature is **a serif display face over monospaced data on a deep blue-black ground**. Dense, calm, and quiet until something needs attention. Dark theme only.

### Color

| Role | Value |
|---|---|
| Page ground | `#0b0e13` |
| Panels, rails | `#0e1218` |
| Fields, raised cards, row hover | `#11161e` |
| Structural lines / field borders / row separators | `#181d26` / `#1d2530` / `#14191f` |
| Text: primary / body / secondary / muted / faint | `#eef2f7` / `#c3ccd9`–`#dbe2ec` / `#97a3b4` / `#66717f` / `#5b6675` |
| **Accent and commit** (one color for every primary action) | `#5b8cff` (secondary `#6f9cff`) |
| Success / on track | `#5fbf8f` |
| Tracking, routine | teal `#3fb6a8` |
| Evening (Wind Down) | violet `#8b7cf0` |
| Events, scuba | cyan `#46b3d6` |
| Deadlines, overdue | orange `#d8826a` |
| Health | terracotta `#d88a6a` |

**Priority chips** (filled mono chip, same hue at 14% opacity behind it): **P1 red `#e0665a`**, **P2 green `#5fbf8f`**, **P3 yellow `#d8a657`**, **P4 gray `#6f7787`**. *(The `--p2` and `--p3` variables in `globals.css` are stale; the `.pri-p1`–`.pri-p4` classes hold the real colors.)*

**Type tags** (mono, colored text): TASK `#8a93a3`, EVENT `#46b3d6`, DEADLINE `#d8826a`.

**Domain dots:** Work `#5b8cff`, Personal `#8b7cf0`.

**Color rules:** blues mean work and legal, teal means tracking, violet means evening. Color signals state; everything that isn't urgent stays grayscale with quiet category dots. There is **one commit color**: "Start the day" and "Close the day" are both the accent blue, never violet.

### Type

- **Newsreader** (serif): headlines, greetings, metric values, quotes. Page titles run about 30–46px. The copy voice is calm and short: "Good morning.", "Close the day.", "How today landed."
- **IBM Plex Sans:** all body and UI text, 13–15px.
- **IBM Plex Mono:** kickers and section labels (UPPERCASE, letter-spaced 0.14–0.22em, about 9.5–11px), badges, times, keycaps, chips. Section labels read like `ON TAP FROM YESTERDAY`, `TOP 3 FOR TODAY`, `THE WEEK THAT WAS`.

### Layout and components

- **Shell:** a left sidebar of the destinations (248px expanded, 66px collapsed into two-letter monogram tiles like `HQ`, `PL`, `WK`), a 54px header (collapse toggle, All/Work/Personal toggle, capture field, live clock), a tab strip for the current destination, and content capped at 1360px wide. Only inner panes scroll. Below 900px the sidebar gives way to a bottom bar, and pane and rail stack.
- **Screens** are usually a scrolling main column plus a fixed right rail of 330–362px.
- **Task row meta line**, in this order: `[P#] [•dot] [SCOPE] [TYPE] [due tag]`, in 10px mono.
- **Editing happens in a slide-in drawer** from the right that auto-saves (no Save buttons, no modals). Click a row to open it; the checkbox completes the task inline.
- **The protected Top 3** carry a priority-colored left border.
- **Radii:** fields and buttons 8–9px, cards and modals 11–15px, chips 5–7px.
- **Glyphs are Unicode** (`+ ✓ ★ ☆ ← → « » × ⌕ ↵ ▣`). No icon library and no image assets.
- **Motion is minimal:** the sidebar width animates, the ⌘K palette pops in, and that's about it.

---

## Data at a glance

Cases (`matters`), tasks (with type, priority, domain, do date and time, estimate, MIT flag, matter, project, waiting-on, recurrence, notes), projects, time sessions (timers), the capture ledger (`entries`, with billed tenths), daily ritual state (intention, reflection, on tap for tomorrow, journal), notes (with links, tags, images), people, habits and habit checks, body metrics, and the media log.

The stack is Next.js + TypeScript on Vercel, with Supabase (Postgres) for data and file storage. Only the server can touch the data. Access is behind a single passcode.

---

## Files worth connecting from GitHub

Repo: **github.com/pastafaucet/AB-HQ** (private), branch **`main`**.

| File | Why |
|---|---|
| `ab-hq/BRIEF.md` | This brief |
| `ab-hq/PROJECT.md` | The technical guide: rules, the full screen map, the data model, and where the last session left off |
| `ab-hq/app/globals.css` | The real design tokens and component styles |
| `ab-hq/lib/nav.ts` | The destinations and their tabs |
| `Design Docs/README.md` | The original high-fidelity design handoff (layout specs for every screen) |
| `Design Docs/AB_HQ_Scope.md` | The original V1 scope and principles (parts are superseded; see the settled decisions above) |
| `ab-hq/app/components/<Screen>Client.tsx` | Add the one screen you're redesigning, e.g. `MyDayClient.tsx`, `WindDownClient.tsx` |
