import { test } from "node:test";
import assert from "node:assert/strict";
import { periodOf, workdays, billableTarget, billableRing, tasksRing, elapsedShare } from "./progress.ts";

test("weeks start on Monday", () => {
  assert.deepEqual([periodOf("week", "2026-11-11").start, periodOf("week", "2026-11-11").end], ["2026-11-09", "2026-11-15"]);
  assert.equal(periodOf("week", "2026-11-09").start, "2026-11-09"); // Monday itself
  assert.equal(periodOf("week", "2026-11-15").start, "2026-11-09"); // Sunday belongs to the week before
});

test("month bounds and workdays", () => {
  const m = periodOf("month", "2026-11-11");
  assert.deepEqual([m.start, m.end, m.label], ["2026-11-01", "2026-11-30", "November"]);
  assert.equal(workdays(m.start, m.end), 21);
});

test("month target is 180; a full week is 180 spread over the month's workdays", () => {
  assert.equal(billableTarget(periodOf("month", "2026-11-11")), 180);
  assert.equal(billableTarget(periodOf("week", "2026-11-11")), Math.round((180 / 21) * 5 * 10) / 10);
});

test("a week split across months takes each month's share", () => {
  // Mon Oct 26 – Sun Nov 1, 2026: Oct has 22 workdays (Mon 26–Fri 30 = 5 days in this week).
  const w = periodOf("week", "2026-10-28");
  assert.equal(w.start, "2026-10-26");
  assert.equal(billableTarget(w), Math.round((180 / 22) * 5 * 10) / 10);
});

test("billable ring sums the period's days and sets pace by workdays elapsed", () => {
  const w = periodOf("week", "2026-11-11");
  const r = billableRing(w, { "2026-11-09": 8, "2026-11-10": 10.6, "2026-11-11": 2, "2026-11-08": 99 }, "2026-11-11");
  assert.equal(r.done, 20.6);
  assert.equal(elapsedShare(w, "2026-11-11"), 3 / 5);
  assert.equal(r.pace, Math.round(r.target * 0.6 * 10) / 10);
  assert.equal(billableRing(w, null, "2026-11-11").note, "Hours sheet unavailable");
});

test("tasks ring counts Tasks and Deadlines, not Events", () => {
  const w = periodOf("week", "2026-11-11");
  const r = tasksRing(
    w,
    [
      { type: "Task", status: "Done", doDate: "2026-11-09" },
      { type: "Deadline", status: "Open", doDate: "2026-11-10" },
      { type: "Task", status: "Open", doDate: "2026-11-12" },
      { type: "Event", status: "Done", doDate: "2026-11-10" },
      { type: "Task", status: "Cancelled", doDate: "2026-11-10" },
      { type: "Task", status: "Done", doDate: "2026-11-02" },
      { type: "Task", status: "Open", doDate: null },
    ],
    "2026-11-11"
  );
  assert.deepEqual([r.done, r.target, r.pace], [1, 3, 2]);
});
