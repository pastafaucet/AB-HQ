-- ============================================================
-- AB HQ — migration 0006
-- Per-task activity log (Created, priority changed, moved to today,
-- completed, …). Paste into the SQL Editor and Run.
-- ============================================================

create table if not exists public.task_activity (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  detail     text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_activity_task_idx on public.task_activity (task_id);

alter table public.task_activity enable row level security;
