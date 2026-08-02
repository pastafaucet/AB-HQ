-- ============================================================
-- AB HQ — migration 0005
-- Time-tracking sessions per task (start/stop, with a note and
-- editable start/end times). Paste into the SQL Editor and Run.
-- ============================================================

create table if not exists public.time_sessions (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  started_at timestamptz not null,
  ended_at   timestamptz,               -- null = currently running
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists time_sessions_task_idx on public.time_sessions (task_id);
-- at most one running session at a time is enforced in app logic; this
-- partial index keeps "find the running one" fast
create index if not exists time_sessions_running_idx on public.time_sessions (ended_at)
  where ended_at is null;

alter table public.time_sessions enable row level security;
