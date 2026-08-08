-- ============================================================
-- AB HQ — migration 0009
-- Real notes: rich-text body (Tiptap JSON + plain-text mirror
-- for search), pinning, and polymorphic links so one note can
-- attach to cases, tasks, and people at once.
-- Paste into the SQL Editor and Run.
-- ============================================================

-- The V1 notes table was a plain-text placeholder (0 rows); extend it.
-- `body` (text) stays as the searchable plain-text mirror of body_json.
alter table public.notes add column if not exists body_json  jsonb;
alter table public.notes add column if not exists pinned     boolean not null default false;
alter table public.notes add column if not exists updated_at timestamptz not null default now();

-- ---------- note_links: note → matter | task | person ----------
create table if not exists public.note_links (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references public.notes(id) on delete cascade,
  target_type text not null check (target_type in ('matter','task','person')),
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (note_id, target_type, target_id)
);
create index if not exists note_links_note_idx   on public.note_links (note_id);
create index if not exists note_links_target_idx on public.note_links (target_type, target_id);

-- Carry over any legacy matter link (none expected; harmless if empty).
insert into public.note_links (note_id, target_type, target_id)
select n.id, 'matter', n.matter_id
from public.notes n
where n.matter_id is not null
on conflict do nothing;

alter table public.note_links enable row level security;
