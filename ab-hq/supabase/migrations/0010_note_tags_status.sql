-- ============================================================
-- AB HQ — migration 0010
-- Topic tags for notes (shared curated list + join table) and
-- the lean note lifecycle: Inbox (needs processing) / Active
-- (normal) / Archived (done, hidden by default).
-- Paste into the SQL Editor and Run.
-- ============================================================

-- ---------- tags (one row per topic; names stored lowercase) ----------
create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.note_tags (
  id         uuid primary key default gen_random_uuid(),
  note_id    uuid not null references public.notes(id) on delete cascade,
  tag_id     uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (note_id, tag_id)
);
create index if not exists note_tags_note_idx on public.note_tags (note_id);
create index if not exists note_tags_tag_idx  on public.note_tags (tag_id);

-- ---------- note lifecycle: Inbox / Active / Archived ----------
-- V1 shipped status check ('Inbox','Reference','Archived') with default
-- 'Inbox'; the lean model makes 'Active' the unmarked normal state.
alter table public.notes drop constraint if exists notes_status_check;
update public.notes set status = 'Active' where status in ('Inbox', 'Reference');
alter table public.notes alter column status set default 'Active';
alter table public.notes add constraint notes_status_check
  check (status in ('Inbox', 'Active', 'Archived'));

alter table public.tags      enable row level security;
alter table public.note_tags enable row level security;
