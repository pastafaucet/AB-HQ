-- ============================================================
-- AB HQ — migration 0012
-- The capture ledger: every raw entry typed into the one box,
-- kept permanently and matter-attributed. Tasks/notes are
-- derived from entries, never a replacement for them.
-- Plus: tasks.waiting_on (the delegation buckets).
-- Paste & Run (safe to re-run).
-- ============================================================

create table if not exists public.entries (
  id         uuid primary key default gen_random_uuid(),
  raw        text not null,                  -- exactly what Andy typed, never edited
  kind       text not null default 'log'
    check (kind in ('log','task','note','event')),
  status     text not null default 'inbox'
    check (status in ('inbox','filed','dismissed')),
  matter_id  uuid references public.matters(id)  on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  task_id    uuid references public.tasks(id)    on delete set null,  -- derived task, if any
  summary    text,                           -- AI one-line normalization (billing narrative seed)
  routed_by  text check (routed_by is null or routed_by in ('ai','manual')),
  created_at timestamptz not null default now()
);
create index if not exists entries_matter_idx  on public.entries (matter_id);
create index if not exists entries_status_idx  on public.entries (status);
create index if not exists entries_created_idx on public.entries (created_at);
alter table public.entries enable row level security;

-- Who the ball is with, when it's not Andy.
alter table public.tasks add column if not exists waiting_on text
  check (waiting_on is null or waiting_on in ('Chris','Opposing Counsel','Court','Other'));
