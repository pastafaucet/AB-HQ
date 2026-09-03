-- ============================================================
-- AB HQ — migration 0015
-- The life half of the daily loop: journal, media/games log,
-- habits with streaks, body metrics. Paste & Run (safe to re-run).
-- ============================================================

-- Open-space journal lives on the day row (year-ago lookups are a date shift).
alter table public.daily_entries add column if not exists journal text;

-- Shows / movies / games / books logged at Wind Down.
create table if not exists public.media_log (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  kind       text not null check (kind in ('show','movie','game','book')),
  title      text not null,
  note       text,                       -- "with Steph", "co-op", season/ep
  created_at timestamptz not null default now()
);
create index if not exists media_log_date_idx on public.media_log (date);
alter table public.media_log enable row level security;

-- Habits + per-day checks (shared state between Start Up and Wind Down).
create table if not exists public.habits (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.habits enable row level security;

create table if not exists public.habit_checks (
  id         uuid primary key default gen_random_uuid(),
  habit_id   uuid not null references public.habits(id) on delete cascade,
  date       date not null,
  unique (habit_id, date)
);
create index if not exists habit_checks_date_idx on public.habit_checks (date);
alter table public.habit_checks enable row level security;

-- One row of body data per day. Morning fills weight/sleep; evening the rest.
create table if not exists public.body_metrics (
  date        date primary key,
  weight_lbs  numeric(5,1),
  sleep_hours numeric(3,1),
  calories    integer,
  protein_g   integer,
  carbs_g     integer,
  fat_g       integer,
  workout     text,                      -- what you did, details, how it felt
  updated_at  timestamptz not null default now()
);
alter table public.body_metrics enable row level security;
