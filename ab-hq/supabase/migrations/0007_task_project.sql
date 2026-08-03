-- ============================================================
-- AB HQ — migration 0007
-- Free-text Project on a task (separate from Matter). Paste & Run.
-- ============================================================

alter table public.tasks add column if not exists project text;
