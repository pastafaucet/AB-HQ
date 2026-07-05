# AB HQ — Project Scope

Scope and contours for building **AB HQ** with Claude Code in VS Code.
Decided items are stated plainly. Genuinely-open items live in §11 (Open Decisions),
each with a provisional default so building can start without waiting on them.

---

## 1. What we're building

- **AB HQ** — a custom, single-user personal operating system and litigation
  command center. A web app, built for one person (an equity-partner litigator).
- It is the **daily-driver layer** — the thing you open all day to run work and life.
- It is **not** a document store (Dropbox stays that) and **not** a file room
  (iManage stays that).
- Cross-device by necessity: Windows at work, Apple at home, phone on the go — so
  it's browser-accessible from anywhere.

## 2. The problem it solves

- Capture was never the hard part. **Daily ritual, processing, and retrieval** were.
- Prior systems (Notion and others) stalled on over-scoping and on inboxes that never
  got processed.
- V1 succeeds only if the daily loop — **pick → do → review → roll over** — is
  frictionless. If that loop dies, the system gets abandoned.

## 3. V1 scope — four surfaces

Build these four. Nothing else ships in V1.

- **Command Center (home)** — where things stand at a glance.
  - Greeting + date + on-track status; an attention band (due today / overdue /
    inbox count); a grid of hubs as navigation, each with a live status line.
  - V1: hub cards may link to placeholders; only the Daily surfaces are fully live.
- **Start Up** (morning ritual, ~5 min) — orient and protect three things.
  - Today's schedule; "on tap from yesterday" (seeded by last Wind Down); slipped /
    overdue items; MIT picker (choose up to 3); an intention line; a "Begin day"
    button → My Day.
- **My Day** (operational cockpit) — the surface opened all day.
  - Today's 3 MITs (protected, visually distinct); also-today tasks; in-progress
    items; right rail with schedule, active matters, and delegations awaiting.
  - This is the density stress test for the design.
- **Wind Down** (evening ritual, ~5 min) — close loops, clear inbox, set tomorrow.
  - Done today; unfinished MITs (roll or drop); inbox triage (task + note inbox with
    inline →Task / →Note / File / Delete actions); pick tomorrow's 3 MITs; "on tap
    for tomorrow"; a reflection line.

**Core constructs that must be real in V1:** 3 protected MITs/day; honest MIT
rollover; inbox triage with aggressive delete; the Start Up → My Day → Wind Down loop.

## 4. Data model (V1)

Lean on purpose. Keep fields to what the four surfaces use.

- **Task**
  - `id`, `title`, `status` (Inbox / To Do / In Progress / Done / Someday / Cancelled),
    `domain` (Work / Personal / Health), `type` (Task / Event / Deadline).
  - `important` (bool), `urgent` (bool) → **priority is derived, not stored**.
  - `mit` (bool), `doDate`, `deadline`, `matterId?`, `effort?`, `createdAt`, `completedAt?`.
- **Matter**
  - `id`, `name`, `client`, `stage`, `status`, `caseNumber?`, `court?`, `judge?`,
    `nextDeadline?`.
  - People start as **structured fields here** (see §11), not a separate entity in V1.
- **Note**
  - `id`, `title`, `body`, `status` (Inbox / Reference / Archived), `domain`,
    `matterId?`, `createdAt`.
- **DailyEntry** (ritual state)
  - `date`, `intention?`, `reflection?`, `onTapForTomorrow?`.
  - MIT selection lives on the Task (`mit` flag), not here.

**Design position:** Deadline is a **property** (a date on a Task or Matter), not its
own entity. Events are a `type` on Task for now; native calendar Events are out of V1
(see §11).

## 5. Key interaction patterns (validated in mockup)

- **Editing a task:** click the row → a **detail panel slides in from the right** →
  edit fields there → **changes auto-save** (no modal, no separate page, no Save button).
- **Creating a task:** same drawer, opened empty via "+ Task"; plus a quick-add input
  for fast title-only capture.
- **Completing:** checkbox on the row toggles done (inline, no drawer needed).
- **Priority:** two Eisenhower checkboxes (Important, Urgent) derive one label live —
  Do Now / Deep Work / Delegate / Low.
- **MIT:** an independent flag (not derived from date). Protected MITs read as distinct
  (numbered + amber left-border in the mockup).

## 6. Design language (converged — treat as fixed)

Carried from the approved mockup (`AB_HQ_Daily_Surfaces.html`) and the task-edit
prototype (`AB_HQ_Task_Editing.html`).

- **Type:** Newsreader (serif) for display moments; JetBrains Mono for labels /
  metadata / dates / counts; Inter for body and UI.
- **Signature:** serif display over monospaced data — that contrast is the identity.
- **Two hard color rules:**
  - **Amber = urgency only** (today / overdue / at-risk / unfinished MIT). Never decorative.
  - **Indigo = the primary commit action only** (Capture, "Begin day"). Never a generic button.
- Dark theme throughout; everything non-urgent is grayscale + quiet category dots.

**Tokens (match exactly — don't improvise new colors):**
```
--bg:      #0a0b0d    --ink:     #e7e7ea   (primary text)
--bg-1:    #0e0f12    --ink-2:   #9a9ba2   (secondary)
--panel:   #14151a    --ink-3:   #62636b   (muted / labels)
--panel-2: #181a20    --ink-4:   #4a4b52   (faint)
--line:    rgba(255,255,255,.06)   --line-2: rgba(255,255,255,.10)

--indigo:  #6470ee   → commit action ONLY
--amber:   #e8895a   → urgency ONLY
--green:   #6cbf8f   → on-track / done
--blue:    #6b9bf0   --purple: #ab8cd4   --teal: #5bb3b0   (category dots)
```

## 7. Tech stack

- **Database / auth / storage:** Supabase (Postgres). *Decided.*
- **Hosting / deploy:** Vercel. *Decided.*
- **Frontend framework:** not finalized. Next.js + TypeScript is the conventional
  pairing with Vercel + Supabase and a sensible default — **confirm before scaffolding**
  (see §11).
- **Styling:** recommend hand-authored CSS driven by the token set above (to preserve
  the bespoke look); utility-CSS frameworks tend to fight a custom aesthetic. Not a
  hard requirement — confirm.
- **Later (not V1):** AI parsing/capture layer (Claude API); document storage
  (Azure or AWS — undecided); SMS/Telegram capture.

## 8. Not in V1 (deferred — capture ideas here, don't build)

- AI layer over the captured stream (classify, route to matter, extract dates, Q&A).
- Capture pipeline (SMS / Telegram → app).
- Projects layer (see §11).
- Health / Habits / Goals / hobby hubs beyond placeholder cards.
- Document storage integration.
- Year-at-a-glance, review-frequency automation, time-tracking rollups, recurring tasks.

## 9. Open decisions (provisional default in brackets — safe to build on, confirm later)

- **Name** — AB HQ vs. Atlas (crowded) vs. other. [default: **AB HQ**]
- **Frontend framework** — [default: **Next.js + TypeScript**, unconfirmed]
- **People** — structured fields on Matter, or a full Person entity?
  [default: **fields on Matter in V1**; promote to an entity later if you need to see a
  person across matters]
- **Events** — native calendar entity, or read from Outlook via Microsoft Graph?
  [default: **no native Events in V1**; My Day / Start Up schedule is manual or
  placeholder until an Outlook/Graph decision]
- **Tasks vs. Deadlines** — one merged list with a `type`, or split views?
  [default: **merged, filtered by type**]
- **Projects layer** — are litigation motions Projects, or task-clusters under a Matter?
  [default: **task-clusters under Matter**; revisit before adding Projects]

## 10. Build order (sequence, not a schedule — no time estimates)

Each step should end in something runnable.

1. Scaffold + a tokens/design-system file + **My Day as static UI** (lock the look first).
2. Supabase schema for the V1 data model (§4) + basic data access.
3. Wire My Day to real data (MITs, tasks, matters, delegations) + the task drawer (§5).
4. Command Center (attention band + hub grid).
5. Start Up (MIT picker → Begin day).
6. Wind Down (inbox triage, MIT rollover, reflection, seed tomorrow).
7. Quick-capture available on every surface.
8. Use it daily for ~2 weeks before adding anything, then revisit §8.

## 11. Working principles (for Claude Code)

- **Ship V1; don't architect indefinitely.** Working code beats a cleaner abstraction.
  The named risk on this project is fiddling forever, not quitting.
- **When a detail is unclear, build the smallest concrete version and show it** — the
  user decides by reacting to real screens, not to abstract prose.
- **Stay in V1 scope.** New ideas go to §8; don't expand mid-task.
- **Single user.** No multi-tenant auth, roles, or scale infrastructure.
- **Aesthetics are load-bearing** — match §6 tokens exactly.
- Be direct about risks and cheaper paths; don't gold-plate.

---

### Reference files
- `AB_HQ_Daily_Surfaces.html` — approved mockup of the four surfaces (visual source of truth).
- `AB_HQ_Task_Editing.html` — validated task create/edit/complete interaction.
