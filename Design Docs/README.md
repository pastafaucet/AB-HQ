# Handoff: Andy's HQ — Personal Operating System

## Overview
Andy's HQ is a dark, information-dense "life OS" for a busy trial lawyer — a single app to run 70+ active litigation matters plus personal projects, habits, goals, journaling, and hobbies (scuba, 3D printing, games). It centers on three daily **ritual surfaces** (Start of Day → Today → Wind Down), a function-organized sidebar of **hubs**, and a global **⌘K quick-capture** flow. The design priorities, in the user's words: make it *easy to get data in*, *easy to get the right data out*, and *not overwhelming* — the right things surface at the right time.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype demonstrating the intended look, layout, and interaction model. **They are not production code to copy directly.** The task is to **recreate this design in your target codebase's environment** (React/Next, Vue, SwiftUI, etc.) using its established component patterns, state, and styling conventions. If no codebase exists yet, choose an appropriate stack — a **React + TypeScript SPA** with a component library and a real data layer is a natural fit, since the prototype is already structured as React-style components with a single logic class.

The prototype is authored as a "Design Component" (`.dc.html`): a template (HTML markup with `{{ }}` bindings and `<sc-for>`/`<sc-if>` control flow) plus a `class Component` logic class exposing render values. Treat the logic class as the spec for state and derived data, and the template as the spec for markup/styling.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and interactions are intended as shown. Recreate the UI faithfully — exact hex values, the two-font system, and the density are all deliberate. The one area intentionally left rough is any hub routed to the shared placeholder (see Screens), and the Health hub (explicit placeholder).

## Global Layout & Chrome

**App shell** — full-viewport flex row, no page scroll; only inner panes scroll.
- Root: `height:100vh; display:flex; background:#0b0e13; color:#c3ccd9; font-family:'IBM Plex Sans'; font-size:14px; line-height:1.45; overflow:hidden`.
- **Left sidebar** (`<aside>`): `width:248px` expanded / `66px` collapsed, `transition:width 0.16s ease`, `background:#0e1218`, `border-right:1px solid #181d26`, vertical flex. Collapse is a runtime toggle (`collapsed` state).
- **Main column**: flex-1 vertical — a 54px header, then the active screen.
- Content is capped and centered: the screen area is `display:flex; justify-content:center`, inner wrapper `max-width:1360px`. This keeps line lengths sane on large monitors regardless of sidebar state.

**Sidebar (expanded)**
- Header block: wordmark **"Andy's HQ"** in `Newsreader` 26px/500, `#eef2f7`; beneath it a mono kicker `PERSONAL OPERATING SYSTEM` (`IBM Plex Mono` 9.5px, letter-spacing 0.22em, `#5b6675`).
- **Capture button**: full-width pill, `background:#5b8cff` (accent), white text 13px/600, `border-radius:9px`, left "+" glyph, right "⌘K" keycap (`background:rgba(255,255,255,0.16)`, radius 5). Opens the capture palette.
- **Nav**: grouped list. Each group has a mono label header (9.5px, letter-spacing 0.16em, `#444e5c`) and items. Each item: `display:flex; gap:11px; padding:7px 11px; border-radius:8px; font-size:13.5px; color:#97a3b4`; leading 6px colored dot; optional right-aligned count badge (mono 10.5px `#5b6675`). Active item: `background:rgba(91,140,255,0.12); color:#eef2f7; font-weight:600`. Hover: `background:#1a212b`.
- Footer: 28px circular avatar (gradient `linear-gradient(135deg,#2a3a55,#1a2230)`, border `#2c3644`) with initials **AC**, name **Andy Coleman**, role **Trial Counsel** (mono 9.5px), and a gear glyph.

**Sidebar (collapsed, 66px)**
- Wordmark becomes a single `Newsreader` "H"; capture becomes a 42px accent square with "+".
- Nav items become centered **monogram tiles**: the item's 2-char code (e.g. `TD`, `CS`, `WK`) in `IBM Plex Mono` 13px/600 tinted the item's dot color, with the count badge inline in `#5b6675`. Groups separated by 1px `#181d26` dividers. Each tile has a `title` attr = full label (tooltip). Active tile keeps the accent-tint background.

**Header (main, 54px)** — `border-bottom:1px solid #181d26; padding:0 20px; gap:16px`.
- Left: **collapse toggle** — 30px hit area, glyph `«` (expanded) / `»` (collapsed), color `#8a93a3`, hover `background:#11161e; color:#eef2f7`.
- **Domain toggle** segmented control: `All` / `Work` / `Personal` (only these three — Health is NOT a domain). Container `background:#11161e; border:1px solid #1d2530; border-radius:9px; padding:2px`. Active segment `background:#1e2733; color:#eef2f7; font-weight:600; border-radius:7px`.
- **Search / capture field**: flex-1, `max-width:480px`, `background:#11161e; border:1px solid #1d2530; border-radius:9px; padding:7px 13px`, placeholder "Search anything, or capture a thought…" (truncates), trailing ⌘K keycap. Click opens the capture palette.
- Right cluster (all `flex:none; white-space:nowrap`): mono datetime `WED · MAY 27 · 9:14` (`#66717f`), a 1px divider, and a status chip — 7px green dot `#5fbf8f` + "On track".

## Sidebar Information Architecture (hubs, grouped by function)
Every sidebar entry is a **hub / dashboard** (a filtered view onto data), not a database. All hubs are always visible regardless of the domain toggle. Groups & items, in order — `[code, dot color, badge]`:

- **HOME** — Andy's HQ `[HQ, #5b8cff]`
- **DAILY** — Start of Day `[AM, #5b8cff]`, Today `[TD, #5b8cff]`, Wind Down `[PM, #8b7cf0]`
- **ACTION** — Quick Drop / Inbox `[QD, #6f9cff, 7]`, Tasks `[TK, #6f9cff, 14]`, Projects `[PJ, #6f9cff, 6]`, Cases `[CS, #5b8cff, 23]`
- **PLANNING** — Goals `[GL, #6f9cff, 4]`, Calendar `[CL, #6f9cff, 3]`
- **REVIEWS** — Weekly `[WK, #6f9cff, 4]`, Monthly `[MO, #6f9cff]`
- **KNOWLEDGE** — Knowledge hub `[KN, #8a93a3]`, Notes `[NT, #8a93a3]`, People `[PE, #8a93a3]`, Tag list `[TG, #8a93a3]`
- **TRACK** — Time `[TM, #3fb6a8]`, Habits `[HB, #3fb6a8, 5/8]`, Journal `[JR, #3fb6a8]`
- **HEALTH** — Health `[HL, #d88a6a]`
- **FUN** — Scuba `[SC, #46b3d6]`, 3D Printing `[3D, #8b7cf0, 2]`, Games `[GM, #d8a657]`

Note the color language: work/legal = blues (`#5b8cff`/`#6f9cff`), tracking/routine = teal (`#3fb6a8`), evening = violet (`#8b7cf0`), health = warm terracotta (`#d88a6a`), and each Fun domain has its own accent. Scuba/3D/Games are **domains/tags**, not functions — they live only under FUN.

## Screens / Views

### 1. Andy's HQ (landing)
- **Purpose**: minimal status + launcher surface. Deliberately NOT over-built.
- **Layout**: single centered column, `max-width:820px`, `padding:44px 40px 60px`.
- **Components**: mono kicker datetime; `Newsreader` greeting headline "Morning, Andy." (`clamp(32px,4.6vw,46px)`, `#eef2f7`); one-line summary (`#66717f`, max-width 560). A row of 4 **stat cards** (`ACTIVE MATTERS 23`, `OPEN TASKS 14`, `TOP 3 SET n/3`, `HABITS 5/8`) — each `background:#0e1218; border:1px solid #181d26; border-radius:13px; padding:18px 20px`, mono label + `Newsreader` 30px value + mono sub. A `JUMP IN` **launcher grid** (`grid-template-columns:repeat(3,1fr); gap:12px`) of hub cards (34px monogram tile + label), each navigating to its hub. A wide accent **Quick capture** button (opens palette).

### 2. Start of Day (morning ritual)
- **Purpose**: triage the day, then commit to the day's **Top 3** (MITs).
- **Layout**: two panes — scrolling triage list (`padding:30px 34px 60px`) + fixed **344px right rail** (`border-left:1px solid #181d26; background:#0e1218`).
- **Left, in order**:
  - Kicker `START OF DAY · WED MAY 27`; `Newsreader` "Good morning."; summary line ("N overdue, N due today, 5 on the calendar…").
  - **ON THE CALENDAR** — agenda rows: right-aligned 64px time column (mono, optional day label above), colored dot, title + place.
  - **OVERDUE · NEEDS A HOME** (section label in `#d8826a`) — task rows. Each row: a **numbered pick control** (see interactions), title, meta line (priority chip + dot + scope + type tag + due tag), and two reschedule chips `→ TMRW` / `→ FRI`. When rescheduled, chips are replaced by a green `→ {label}` confirmation.
  - **DUE TODAY** — same task-row pattern with pick control.
- **Right rail — TODAY'S TOP 3**: three slots. Filled slot = numbered accent square + title + meta + remove "×"; empty slot = dashed card "Pick a task from the left". Primary **"Start the day →"** commit button (accent indigo), mono reassurance beneath.

### 3. Today (the day's cockpit)
- **Purpose**: execute the committed day.
- **Layout**: scrolling main + **362px right rail**.
- **Left**: header with `Newsreader` "Wednesday, May 27" (`clamp(30px,4.2vw,42px)`) and a right-aligned due/hearings summary. **TOP 3 FOR TODAY** — the three MITs from Start of Day (checkbox, title, priority+scope+type meta, star). A "Focus this week" **read-only reference strip** of weekly Focus Items (distinct from Top 3 — see MITs vs Focus). **UP NEXT** unified agenda (work + personal + hobby events interleaved). **ALL OPEN · N** task list with All/Work/Personal filter chips.
- **Right rail**: **HABITS** (see naming note — this rail is labeled "Habits", matching the sidebar) split MORNING / EVENING, each row a checkbox + label + streak count ("12d"), with a `MISSED` flag where broken; a habit score `n/8`. A **SLIPPING** widget (matters/projects gone quiet — this is the *daily* nudge, distinct from Weekly Review). An **ON THE RADAR** resurfaced-note card (`Newsreader` italic quote + PROMOTE/ARCHIVE chips).

### 4. Wind Down (evening ritual)
- **Purpose**: review how today landed, clear/reschedule the rest, set up tomorrow.
- **Layout**: scrolling main + **344px right rail**.
- **Left**: kicker `WIND DOWN · WED MAY 27` in violet `#8b7cf0`; `Newsreader` "How today landed."; a row of 4 recap **stat cards** (`TASKS DONE n/total`, `TOP 3 n/filled`, `TIME LOGGED 6.4 hrs`, `HABITS 5/8`). **STILL OPEN · N** — remaining tasks, each with a checkbox and `→ TMRW` / `→ FRI` reschedule chips (green confirmation when moved).
- **Right rail**: **DONE TODAY · N** struck-through completed list; a `ONE LINE ON TODAY` reflection input; a `TOMORROW'S FIRST MOVE` input (both `border:1px solid #1d2530`, focus border violet). Primary **"Close out the day →"** commit button — **must be the same indigo `#5b8cff` as "Start the day"** (one commit color everywhere; it is NOT violet).

### 5. Cases (list hub)
- **Purpose**: scan all active litigation matters.
- **Layout**: full-width scrolling section (`padding:30px 36px 60px`).
- **Components**: header ("Cases", `Newsreader` 38px) + subline ("23 active matters · 4 due this week · 1 overdue") + accent "New matter" button. Filter chips (`ALL · 23` / `TRIAL` / `DISCOVERY` / `SETTLEMENT` / `ON HOLD`). A **table** with a mono column header row (`MATTER / CLIENT / STATUS / NEXT ACTION / COURT / TIME`) and rows: status dot + matter name + `no · type` sub; client; a status **pill** (mono 9.5px, per-status bg+color); next action + colored date; court (mono); tracked hours (right-aligned). Row hover `background:#11161e`; click → Case detail.
- **Status colors**: Trial `#d8826a`, Discovery `#3fb6a8`, Settlement `#5b8cff`, Probate `#8b7cf0`, On hold `#66717f`, Active `#5fbf8f`, Transactional `#46b3d6` (each with a matching dim pill background).

### 6. Case detail
- **Purpose**: one matter's full picture.
- **Layout**: scrolling main + **330px right rail**.
- **Left**: back link "← Cases"; status pill + type; `Newsreader` 34px matter name; mono `no · court · judge`. A 3-up **metric strip** (`TIME TRACKED` hrs / `NEXT DEADLINE` / `TRIAL DATE`, each `Newsreader` value with mono unit). **TASKS & DEADLINES** (rows with checkbox + priority chip + type tag + due tag). **DOCUMENTS** (file-type chip + name + meta, e.g. DOCX/PDF/XLSX). **NOTES** (cards: title + date + snippet).
- **Right rail**: **SNAPSHOT** key/value list (Client, Stage, Filed, Next hearing). **KEY PARTIES** (role kicker + name + colored dot: client/opposing/opp. counsel/judge/expert). **RECENT TIME** entries (desc + date + hours).

### 7. Weekly Review
- **Purpose**: a weekly **inbox-to-zero processing pass** — distinct from the daily "Slipping" widget.
- **Components**: **FOCUS ITEMS** for the week (the weekly intent layer — see below); **UNFILED INBOX** items (each: dot + title + meta, with FILE / ARCHIVE actions on their own line below the title so titles never truncate); **OVERDUE FOR REVIEW** matters/projects; **STALLED DELEGATIONS** (task + assignee `→ K. PARK` + waiting duration).

### 8. Health (placeholder hub)
- **Purpose**: will later aggregate health summaries (training, sleep, nutrition, bloodwork, appointments, body metrics). **Do not build the sections yet.**
- **Components**: terracotta kicker `HEALTH HUB`; `Newsreader` "Health"; a "sections aren't built yet" note; a `repeat(3,1fr)` grid of **dashed placeholder tiles** labeled with the future sections, each reading "Coming later".

### 9. Placeholder hubs
Quick Drop/Inbox, Tasks, Projects, Notes, Journal, Habits, Goals, Calendar, Monthly, Knowledge hub, People, Tag list, Time, Scuba, 3D Printing, Games currently route to a shared centered **placeholder** (module glyph + `Newsreader` title + note that the surface reuses the same patterns). These are the next hubs to design/build.

## Capture Palette (⌘K) — the "easy in" flow
Global modal, the core of fast data entry.
- **Trigger**: `⌘K` / `Ctrl+K` toggles it; `Esc` closes. Also opened by the Capture button, header search, and HQ quick-capture.
- **Look**: fixed overlay `background:rgba(4,6,10,0.62); backdrop-filter:blur(3px)`, centered near top (`padding-top:13vh`). Panel `width:640px; background:#12161e; border:1px solid #2a3342; border-radius:15px; box-shadow:0 30px 80px -20px rgba(0,0,0,0.7)`. Entry animation `atlasPop` (0.16s) + `atlasFade`.
- **Rows**: an autofocused text input (placeholder "Add a task, note, event, or time entry…") with an `ESC` keycap; then a list of **kind options** — TASK / DEADLINE / EVENT / NOTE / TIME (Log time) / JOURNAL, each a colored mono chip + label + hint.
- **Priority row**: `PRIORITY` label + `P1 P2 P3 P4` chips (default selection P2, shown with a colored outline) + hint `P1 URGENT → P4 SOMEDAY`.
- **File-under row**: `FILE UNDER` + quick tag chips (a matter e.g. "Henderson", "Personal", "Scuba") + `↵ to save`.

## Task model: Priority & Type (applies to every task everywhere)
- **Priority** P1–P4, rendered as a filled mono chip (`padding:1px 6px; border-radius:5px; font-weight:600`):
  - P1 `#e0665a` on `rgba(224,102,90,0.14)` — urgent
  - P2 `#d8a657` on `rgba(216,166,87,0.14)`
  - P3 `#5b8cff` on `rgba(91,140,255,0.14)`
  - P4 `#6f7787` on `rgba(111,119,135,0.14)` — someday
- **Type** tag (mono, colored text): `TASK` `#8a93a3`, `EVENT` `#46b3d6`, `DEADLINE` `#d8826a`.
- Standard task-row **meta line** order: `[P#] [•dot] [SCOPE] [TYPE] [due tag]` in `IBM Plex Mono` 10px, letter-spacing 0.08em.

## MITs vs Focus Items (two separate layers — both required)
- **MIT (Most Important Tasks)** = today's **Top 3** protected tasks. Chosen on Start of Day, executed on Today. This is the daily layer. Keep as built.
- **Focus Items** = **weekly** intent across 3–5 active projects. A separate layer. Surfaced on **Weekly Review** (full) and on **Today** as a small **read-only reference strip**. **Do NOT merge Focus Items into Top 3** — they are different scopes (week vs day).

## Interactions & Behavior
- **Sidebar collapse**: header `«`/`»` toggles `collapsed`; width animates 248↔66px; nav switches between labeled rows and monogram tiles; content stays capped at 1360px.
- **Navigation**: clicking any sidebar hub or HQ launcher sets the active `screen`; the active item highlights. No routing library in the prototype — a `screen` string switch. In production, map each hub to a real route.
- **Pick Top 3** (Start of Day): each triage row has a pick control — empty = dashed "+" square (hover border `#5b8cff`); picked = solid accent square showing its 1/2/3 order number. Clicking toggles membership; **capped at 3** (further picks ignored until one is removed). The chosen set is the exact Top 3 shown on Today. Remove via the "×" on the rail slot or re-clicking the row control.
- **Complete a task**: clicking a checkbox toggles done; done rows get `color:#5b6675; text-decoration:line-through`. Completion state is shared across screens (Today, Wind Down, Case detail read the same source), so Wind Down's "Done / Still Open" and stat counts reflect real state.
- **Reschedule** (Start of Day overdue, Wind Down still-open): `→ TMRW` / `→ FRI` chips set a `moved` label; the row then shows a green `→ {label}` confirmation and is treated as handled.
- **Habits**: clicking a habit checkbox toggles it; the rail score and Wind Down habit stat update.
- **Hover states**: nav items `#1a212b`; list rows `#0e1218` or `#11161e`; buttons `filter:brightness(1.08)`; reschedule/tag chips brighten bg+text.
- **Transitions/animations**: sidebar width 0.16s ease; palette `atlasPop`/`atlasFade` (see keyframes below). No other motion.

## State Management
Prototype state (single logic class) — replicate as component/store state:
- `screen` — active hub id (string). → routing in production.
- `collapsed` — sidebar collapsed boolean.
- `picked` — ordered array of task ids in Top 3 (max length 3).
- `moved` — map of taskId → reschedule label ("Tomorrow" | "Fri").
- `done` — map of taskId → boolean completion.
- `habits` — map of habitId → boolean done-today.
- `paletteOpen` — capture modal open boolean; bound to the ⌘K/Esc key handler (added on mount, removed on unmount).
- Derived (compute, don't store): overdue/due-today lists, the three Top-3 slots (filled/empty), completed vs still-open lists, counts (overdue, due today, done/total, open-left, top3 done/filled), habit score, HQ stat values.
- **Data layer (production)**: tasks, matters/cases, projects, notes, people, tags, time entries, habits, goals, journal, calendar events. Tasks carry at minimum: id, title, scope/matter ref, `priority` (1–4), `type` (task|event|deadline), due info, done, and (for triage) bucket + moved. Cases carry: name, client, matter number, type, status, next action + date, court, judge, tracked hours, parties, documents, notes, time entries.

## Design Tokens
**Colors**
- Backgrounds: page `#0b0e13`; panels/rails `#0e1218`; inset fields/cards `#11161e`; hover row `#11161e`; subtle hover `#0e1218`; active nav tint `rgba(91,140,255,0.12)` / tile `rgba(91,140,255,0.16)`.
- Borders/dividers: `#181d26` (structural), `#1d2530` (fields), `#14191f` (row separators), `#232c38` / `#2c3644` (raised/hover).
- Text: primary `#eef2f7`; body `#dbe2ec` / `#c3ccd9`; secondary `#97a3b4` / `#9aa6b6`; muted `#66717f`; faint `#5b6675`; disabled/placeholder `#4a5462` / `#444e5c`.
- **Accent / commit (indigo)**: `#5b8cff` — the single primary/commit color (buttons, active states, Start-the-day AND Close-out-the-day). Secondary blue `#6f9cff`.
- Semantic: success/green `#5fbf8f`; teal (track) `#3fb6a8`; violet (evening) `#8b7cf0`; cyan (event/scuba) `#46b3d6`; warn/orange (deadline) `#d8826a`; health terracotta `#d88a6a`; amber `#d8a657`.
- Priority: P1 `#e0665a`, P2 `#d8a657`, P3 `#5b8cff`, P4 `#6f7787` (chip backgrounds are the same hue at 0.14 alpha).

**Typography** — two families:
- `Newsreader` (serif, weights 300–600; italic used for quotes) — headlines, greetings, metric values, note quotes. Sizes: page H1 `clamp(30–32px, 4.2–4.6vw, 42–46px)`, section titles 34–38px, metric values 26–30px.
- `IBM Plex Sans` (400–700) — all UI body/labels/list text (13–15px).
- `IBM Plex Mono` (400–600) — kickers, section labels (letter-spacing 0.14–0.22em), badges, times, keycaps, priority/type tags (9.5–13px).

**Spacing / radius / other**
- Radii: fields/buttons 8–9px; cards/modals 11–15px; chips/badges 5–7px; pills 6px; avatars/dots full.
- Sidebar 248 / 66px; content cap 1360px; right rails 330 / 344 / 362px; header 54px.
- Shadows: accent button `0 6px 18px -8px #5b8cff`; modal `0 30px 80px -20px rgba(0,0,0,0.7)`.
- Custom scrollbars: 10px, thumb `#1d2530` (hover `#2c3644`) on transparent track.

**Keyframes**
- `atlasPop`: opacity 0→1, `translateY(10px) scale(.985)` → none, 0.16s `cubic-bezier(.2,.7,.3,1)`.
- `atlasFade`: opacity 0→1, 0.12s ease.

## Assets
No image or icon files — all glyphs are Unicode (`+ ✓ ★ ☆ ← → « » × ⌕ ⚙ ↵ ↺`) and all visuals are CSS. Fonts load from Google Fonts (`Newsreader`, `IBM Plex Sans`, `IBM Plex Mono`). In production, substitute your codebase's icon set for the Unicode glyphs and self-host or import the fonts per your stack.

## Files
- `Atlas Life OS.dc.html` — the full source prototype (template + logic class). This is the authoritative reference. ("Atlas" was the prototype's working filename; the product is **Andy's HQ** — use that name.)
- `Atlas Life OS (standalone).html` — a self-contained single-file build of the same design for opening in a browser without any runtime. Use it only to view/click the prototype; build from the `.dc.html` source.

### Reading the source
- The template uses `{{ path }}` bindings, `<sc-for list as>` (loops), and `<sc-if value>` (conditionals). Read these as JSX `.map()` and conditional rendering.
- `class Component`'s `renderVals()` returns every value the template consumes — it is effectively the view-model. Start there to understand data shape and derivations; the handlers on it (toggle done, pick Top 3, move, toggle habit, open/close palette, navigate) define the interaction contract.
- Styling is inline in the template. Pull the token values above rather than copying inline strings; wire them to your design-system tokens/Tailwind config.
