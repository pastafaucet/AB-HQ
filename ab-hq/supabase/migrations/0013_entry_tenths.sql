-- ============================================================
-- AB HQ — migration 0013
-- Billed time on captured entries, in tenths of an hour —
-- Andy's billing unit ("emails with CoCo re same (.2)").
-- Paste & Run (safe to re-run).
-- ============================================================

alter table public.entries add column if not exists billed_tenths integer
  check (billed_tenths is null or billed_tenths > 0);
