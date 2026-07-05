-- ============================================================
-- AB HQ — V1 schema (scope §4)
-- Lean on purpose: only what the four daily surfaces use.
-- Access is server-only (service_role); RLS is enabled with no
-- public policies so the browser anon key can't touch the data.
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
-- MIT selection lives on tasks.mit, not here (scope §4).
create table if not exists public.daily_entries (
  date               date primary key,
  intention          text,
  reflection         text,
  on_tap_for_tomorrow text
);

-- ---------- lock down: RLS on, no public policies ----------
-- service_role (used only on the server) bypasses RLS; anon/authenticated
-- get nothing. Revisit when a real auth gate + policies are added.
alter table public.matters       enable row level security;
alter table public.tasks         enable row level security;
alter table public.notes         enable row level security;
alter table public.daily_entries enable row level security;
