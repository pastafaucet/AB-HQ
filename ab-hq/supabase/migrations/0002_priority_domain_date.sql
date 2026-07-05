-- ============================================================
-- AB HQ — migration 0002
-- Priority becomes an explicit P1–P4 (drop Eisenhower important/urgent),
-- domains reduce to Work/Personal, and there is a single "do date" (+ time)
-- instead of separate do_date and deadline.
-- Paste this whole file into the Supabase SQL Editor and Run.
-- ============================================================

-- 1) explicit priority (1=P1 … 4=P4), backfilled from the old flags
alter table public.tasks
  add column if not exists priority int not null default 3 check (priority between 1 and 4);

update public.tasks set priority = case
  when important and urgent then 1
  when important then 2
  when urgent then 3
  else 4
end
where exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'tasks' and column_name = 'important'
);

-- 2) time-of-day for the do date
alter table public.tasks add column if not exists do_time time;

-- 3) collapse deadline into do_date, then drop deadline
update public.tasks set do_date = deadline where do_date is null and deadline is not null;
alter table public.tasks drop column if exists deadline;

-- 4) drop the Eisenhower columns
alter table public.tasks drop column if exists important;
alter table public.tasks drop column if exists urgent;

-- 5) domains: Work / Personal only
alter table public.tasks  drop constraint if exists tasks_domain_check;
alter table public.tasks  add  constraint tasks_domain_check  check (domain in ('Work','Personal'));
alter table public.notes  drop constraint if exists notes_domain_check;
alter table public.notes  add  constraint notes_domain_check  check (domain is null or domain in ('Work','Personal'));
