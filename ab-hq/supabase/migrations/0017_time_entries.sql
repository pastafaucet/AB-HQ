-- ============================================================
-- AB HQ — migration 0017
-- Time entry from Capture into the "2021 AB Daily Hours" Google
-- Sheet (the sheet is the record). This adds:
--   * time_entry_aliases: Andy's shorthand -> canonical Clients name
--   * time_entry_log: audit trail of every write (never used to
--     pick a row later)
--   * time_entry_lock: one-row lock so two captures never touch the
--     sheet's helper cells at the same time
--   * entries.routed_by may be 'hours' (the raw capture is kept)
-- Paste & Run (safe to re-run).
-- ============================================================

create table if not exists public.time_entry_aliases (
  id         uuid primary key default gen_random_uuid(),
  typed      text not null,
  canonical  text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists time_entry_aliases_typed_idx
  on public.time_entry_aliases (lower(typed));
alter table public.time_entry_aliases enable row level security;

insert into public.time_entry_aliases (typed, canonical)
select v.typed, v.canonical
from (values
  ('AB 218', 'COLA/Does'),
  ('GW Fire', 'Fire cases'),
  ('GW - Fire', 'Fire cases'),
  ('Morales', 'COLA/Fight Club 2'),
  ('LOJHK', 'COLA/Fight Club 3'),
  ('Tia', 'Cedars/Tia'),
  ('Cedars Huntington', 'Cedars/Huntington'),
  ('RS Gen', 'RS/General'),
  ('Biz dev', 'GW/Business Dev.'),
  ('GW Admin', 'GW/Administration')
) as v(typed, canonical)
where not exists (
  select 1 from public.time_entry_aliases a where lower(a.typed) = lower(v.typed)
);

create table if not exists public.time_entry_log (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  raw         text not null,
  parsed      jsonb,
  action      text,            -- MERGE / APPEND / INSERT / UNDO / EDIT / ASK
  row_written integer,         -- audit only; never reused to write
  readback    jsonb,
  status      text not null default 'ok',   -- ok / undone / failed
  sheet_id    text,
  undo        jsonb            -- what Undo needs: date, client, description, prior D and F
);
create index if not exists time_entry_log_created_idx on public.time_entry_log (created_at desc);
alter table public.time_entry_log enable row level security;

create table if not exists public.time_entry_lock (
  id           integer primary key default 1 check (id = 1),
  locked_until timestamptz not null default 'epoch',
  holder       text
);
insert into public.time_entry_lock (id) values (1) on conflict (id) do nothing;
alter table public.time_entry_lock enable row level security;

-- The raw capture of a time entry stays in the ledger, marked as such.
alter table public.entries drop constraint if exists entries_routed_by_check;
alter table public.entries add constraint entries_routed_by_check
  check (routed_by is null or routed_by in ('ai', 'manual', 'hours'));
