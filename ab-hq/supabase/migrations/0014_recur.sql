-- ============================================================
-- AB HQ — migration 0014
-- Recurring tasks/events: a compact JSON rule on the task
-- ({"freq":"weekly","interval":1,"byDay":[2]}). Completing a
-- recurring task spawns the next instance; the rule travels
-- to the new instance. Paste & Run (safe to re-run).
-- ============================================================

alter table public.tasks add column if not exists recur text;
