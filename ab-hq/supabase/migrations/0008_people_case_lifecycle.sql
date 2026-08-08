-- ============================================================
-- AB HQ — migration 0008
-- People per case (opposing counsel, judges, experts, client
-- reps…) shared across matters, plus case lifecycle: closing a
-- case with a disposition. Paste into the SQL Editor and Run.
-- ============================================================

-- ---------- people (one row per human, shared across cases) ----------
create table if not exists public.people (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  org        text,          -- firm / court / company
  email      text,
  phone      text,
  notes      text,
  created_at timestamptz not null default now()
);
create unique index if not exists people_name_org_idx
  on public.people (lower(name), coalesce(lower(org), ''));

-- ---------- matter_people (who is involved, in what role) ----------
create table if not exists public.matter_people (
  id         uuid primary key default gen_random_uuid(),
  matter_id  uuid not null references public.matters(id) on delete cascade,
  person_id  uuid not null references public.people(id) on delete cascade,
  role       text not null,  -- Opposing Counsel / Judge / Expert / Client Rep / …
  created_at timestamptz not null default now(),
  unique (matter_id, person_id, role)
);
create index if not exists matter_people_matter_idx on public.matter_people (matter_id);
create index if not exists matter_people_person_idx on public.matter_people (person_id);

-- ---------- case lifecycle ----------
alter table public.matters add column if not exists disposition text;  -- Settled / Dismissed / Trial / …
alter table public.matters add column if not exists closed_at timestamptz;

-- ---------- carry existing judge names into people ----------
insert into public.people (name)
select distinct trim(m.judge)
from public.matters m
where m.judge is not null and trim(m.judge) <> ''
on conflict do nothing;

insert into public.matter_people (matter_id, person_id, role)
select m.id, p.id, 'Judge'
from public.matters m
join public.people p on lower(p.name) = lower(trim(m.judge)) and p.org is null
where m.judge is not null and trim(m.judge) <> ''
on conflict do nothing;

-- ---------- lock down like everything else ----------
alter table public.people        enable row level security;
alter table public.matter_people enable row level security;
