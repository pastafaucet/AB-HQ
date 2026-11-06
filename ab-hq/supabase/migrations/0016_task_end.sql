-- ============================================================
-- AB HQ — migration 0016
-- Multi-day items (trips, trial weeks): an optional end date
-- and end time on tasks. Same-day items leave both null; their
-- end comes from do_time + duration_min. Paste & Run (safe to re-run).
-- ============================================================

alter table public.tasks add column if not exists end_date date;
alter table public.tasks add column if not exists end_time time;
