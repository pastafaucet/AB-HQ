-- ============================================================
-- AB HQ — migration 0003
-- Free-text notes on a task (shown in the edit drawer under Do date).
-- Paste into the Supabase SQL Editor and Run.
-- ============================================================

alter table public.tasks add column if not exists notes text;
