-- ============================================================
-- AB HQ — migration 0011
-- Projects promoted from free text to a lean entity: a named
-- task-cluster under a case, with a terminal deadline and a
-- simple lifecycle. Paste & Run (safe to re-run).
-- ============================================================

create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  matter_id    uuid references public.matters(id) on delete set null,
  deadline     date,                -- the terminal date (e.g. hearing / filing)
  status       text not null default 'Active'
    check (status in ('Active','Done','Archived')),
  notes        text,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.projects enable row level security;

alter table public.tasks add column if not exists
  project_id uuid references public.projects(id) on delete set null;
create index if not exists tasks_project_id_idx on public.tasks (project_id);

-- Backfill: one project per distinct free-text name already on tasks.
-- The project inherits the matter when every tagged task agrees on one.
insert into public.projects (name, matter_id)
select
  p.name,
  case when count(distinct t.matter_id) = 1
       then (array_agg(t.matter_id) filter (where t.matter_id is not null))[1]
       else null end
from (
  select distinct trim(project) as name
  from public.tasks
  where project is not null and trim(project) <> ''
) p
join public.tasks t on trim(t.project) = p.name
where not exists (select 1 from public.projects x where x.name = p.name)
group by p.name;

update public.tasks t
set project_id = pr.id
from public.projects pr
where t.project_id is null
  and t.project is not null
  and trim(t.project) = pr.name;

-- The old free-text column stays for history; the app no longer reads it.
