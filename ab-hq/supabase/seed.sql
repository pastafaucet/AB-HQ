-- ============================================================
-- AB HQ — seed data (mirrors the initial mock; today = 2026-07-05)
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING, safe to re-run.
-- Priority: 1=P1 … 4=P4.
-- ============================================================

insert into public.matters (id, name, client, stage, status, court, judge, next_deadline) values
  ('11111111-1111-1111-1111-111111111111', 'Henderson v. Coastal', 'R. Henderson', 'Trial',     'Trial',     'Superior Ct · Dept 12', 'Hon. A. Wu',   '2026-07-05'),
  ('22222222-2222-2222-2222-222222222222', 'Delgado v. Metro',     'L. Delgado',   'Discovery', 'Discovery', 'Superior Ct · Dept 4',  'Hon. R. Diaz', '2026-07-09'),
  ('33333333-3333-3333-3333-333333333333', 'Whitfield Estate',     'Whitfield',    'Probate',   'Probate',   'Probate Ct · Dept 2',   'Hon. M. Lang', '2026-07-14'),
  ('44444444-4444-4444-4444-444444444444', 'Okafor v. Summit',     'D. Okafor',    'Discovery', 'Discovery', 'Superior Ct · Dept 9',  'Hon. S. Park', '2026-07-05')
on conflict (id) do nothing;

insert into public.tasks
  (id, title, status, domain, type, priority, mit, do_date, do_time, matter_id, completed_at) values
  ('a0000001-0000-0000-0000-000000000001', 'Finish reply brief — Henderson v. Coastal', 'In Progress', 'Work', 'Deadline', 1, true,  '2026-07-05', null,    '11111111-1111-1111-1111-111111111111', null),
  ('a0000002-0000-0000-0000-000000000002', 'Prep Delgado deposition outline',           'To Do',       'Work', 'Task',     2, true,  '2026-07-05', null,    '22222222-2222-2222-2222-222222222222', null),
  ('a0000003-0000-0000-0000-000000000003', 'Call Dr. Reyes re: expert report',          'Done',        'Work', 'Task',     1, true,  '2026-07-05', null,    '33333333-3333-3333-3333-333333333333', now()),
  ('a0000004-0000-0000-0000-000000000004', 'Review discovery responses — Okafor',       'To Do',       'Work', 'Task',     2, false, '2026-07-05', null,    '44444444-4444-4444-4444-444444444444', null),
  ('a0000005-0000-0000-0000-000000000005', 'Sign engagement letter — Pearson intake',   'To Do',       'Work', 'Task',     3, false, '2026-07-05', null,    null,                                   null),
  ('a0000006-0000-0000-0000-000000000006', 'Meet & confer call — Okafor',               'To Do',       'Work', 'Event',    3, false, '2026-07-05', '16:30', '44444444-4444-4444-4444-444444444444', null),
  ('a0000007-0000-0000-0000-000000000007', 'Renew bar membership',                      'To Do',       'Personal', 'Deadline', 4, false, '2026-07-05', null, null,                                   null),
  ('a0000008-0000-0000-0000-000000000008', 'Draft MSJ opposition — Coastal',            'In Progress', 'Work', 'Task',     2, false, null,         null,    '11111111-1111-1111-1111-111111111111', null),
  ('a0000009-0000-0000-0000-000000000009', 'Outline settlement terms — Delgado',        'In Progress', 'Work', 'Task',     4, false, null,         null,    '22222222-2222-2222-2222-222222222222', null)
on conflict (id) do nothing;
