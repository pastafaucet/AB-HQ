-- ============================================================
-- AB HQ — one-shot setup: schema + seed.
-- Paste this whole file into the Supabase SQL Editor and Run.
-- (Combines migrations/0001_init.sql + seed.sql; safe to re-run.)
-- ============================================================

-- ---------- matters ----------
create table if not exists public.matters (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  client        text,
  stage         text,
  status        text,                          -- Trial / Discovery / Settlement / Probate / On hold / Active
  case_number   text,
  court         text,
  judge         text,
  next_deadline date,
  created_at    timestamptz not null default now()
);

-- ---------- tasks ----------
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  status       text not null default 'Inbox'
    check (status in ('Inbox','To Do','In Progress','Done','Someday','Cancelled')),
  domain       text not null default 'Work'
    check (domain in ('Work','Personal','Health')),
  type         text not null default 'Task'
    check (type in ('Task','Event','Deadline')),
  important    boolean not null default false,  -- priority is DERIVED from
  urgent       boolean not null default false,  -- important + urgent, never stored
  mit          boolean not null default false,  -- independent "Most Important Task" flag
  do_date      date,
  deadline     date,
  matter_id    uuid references public.matters(id) on delete set null,
  effort       text,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tasks_do_date_idx  on public.tasks (do_date);
create index if not exists tasks_status_idx   on public.tasks (status);
create index if not exists tasks_mit_idx      on public.tasks (mit) where mit;
create index if not exists tasks_matter_idx   on public.tasks (matter_id);

-- ---------- notes ----------
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  title      text,
  body       text,
  status     text not null default 'Inbox'
    check (status in ('Inbox','Reference','Archived')),
  domain     text
    check (domain is null or domain in ('Work','Personal','Health')),
  matter_id  uuid references public.matters(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- daily_entries (ritual state) ----------
create table if not exists public.daily_entries (
  date               date primary key,
  intention          text,
  reflection         text,
  on_tap_for_tomorrow text
);

-- ---------- lock down: RLS on, no public policies ----------
alter table public.matters       enable row level security;
alter table public.tasks         enable row level security;
alter table public.notes         enable row level security;
alter table public.daily_entries enable row level security;

-- ============================================================
-- Seed (today = 2026-07-05). Idempotent via fixed UUIDs.
-- ============================================================

insert into public.matters (id, name, client, stage, status, court, judge, next_deadline) values
  ('11111111-1111-1111-1111-111111111111', 'Henderson v. Coastal', 'R. Henderson', 'Trial',     'Trial',     'Superior Ct · Dept 12', 'Hon. A. Wu',    '2026-07-05'),
  ('22222222-2222-2222-2222-222222222222', 'Delgado v. Metro',     'L. Delgado',   'Discovery', 'Discovery', 'Superior Ct · Dept 4',  'Hon. R. Diaz',  '2026-07-09'),
  ('33333333-3333-3333-3333-333333333333', 'Whitfield Estate',     'Whitfield',    'Probate',   'Probate',   'Probate Ct · Dept 2',   'Hon. M. Lang',  '2026-07-14'),
  ('44444444-4444-4444-4444-444444444444', 'Okafor v. Summit',     'D. Okafor',    'Discovery', 'Discovery', 'Superior Ct · Dept 9',  'Hon. S. Park',  '2026-07-05')
on conflict (id) do nothing;

insert into public.tasks
  (id, title, status, domain, type, important, urgent, mit, do_date, deadline, matter_id, completed_at) values
  ('a0000001-0000-0000-0000-000000000001', 'Finish reply brief — Henderson v. Coastal', 'In Progress', 'Work', 'Deadline', true,  true,  true,  '2026-07-05', '2026-07-05', '11111111-1111-1111-1111-111111111111', null),
  ('a0000002-0000-0000-0000-000000000002', 'Prep Delgado deposition outline',           'To Do',       'Work', 'Task',     true,  false, true,  '2026-07-05', null,         '22222222-2222-2222-2222-222222222222', null),
  ('a0000003-0000-0000-0000-000000000003', 'Call Dr. Reyes re: expert report',          'Done',        'Work', 'Task',     true,  true,  true,  '2026-07-05', null,         '33333333-3333-3333-3333-333333333333', now()),
  ('a0000004-0000-0000-0000-000000000004', 'Review discovery responses — Okafor',       'To Do',       'Work', 'Task',     true,  false, false, '2026-07-05', null,         '44444444-4444-4444-4444-444444444444', null),
  ('a0000005-0000-0000-0000-000000000005', 'Sign engagement letter — Pearson intake',   'To Do',       'Work', 'Task',     false, true,  false, '2026-07-05', null,         null,                                   null),
  ('a0000006-0000-0000-0000-000000000006', 'Meet & confer call — Okafor',               'To Do',       'Work', 'Event',    false, true,  false, '2026-07-05', null,         '44444444-4444-4444-4444-444444444444', null),
  ('a0000007-0000-0000-0000-000000000007', 'Renew bar membership',                      'To Do',       'Personal', 'Deadline', false, false, false, '2026-07-05', '2026-07-31', null,                              null),
  ('a0000008-0000-0000-0000-000000000008', 'Draft MSJ opposition — Coastal',            'In Progress', 'Work', 'Task',     true,  false, false, null,         null,         '11111111-1111-1111-1111-111111111111', null),
  ('a0000009-0000-0000-0000-000000000009', 'Outline settlement terms — Delgado',        'In Progress', 'Work', 'Task',     false, false, false, null,         null,         '22222222-2222-2222-2222-222222222222', null)
on conflict (id) do nothing;
