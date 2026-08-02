-- ============================================================
-- AB HQ — migration 0004
-- Duration (minutes) for a task, so a timed task can render as a
-- sized block on the Today schedule. Paste into SQL Editor and Run.
-- ============================================================

alter table public.tasks add column if not exists duration_min int;
