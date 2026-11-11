// The period engine for the planning layer (step 2, Nov 2026). Pure functions,
// no I/O, so the rings, and later the Week/Month/Year views, share one set of
// rules. Dates are YYYY-MM-DD strings in the app's time zone.
//
// Andy's rules (2026-11-11):
// - Weeks start on Monday.
// - The Tasks ring counts Tasks and Deadlines dated in the period. Events are
//   left out: they happen whether or not he acts, so they'd score attendance.
// - Billable hours target: 180 a month. A week's target is the month's spread
//   over workdays (Mon–Fri), so a week split across two months takes each
//   month's share.

export type PeriodKind = "week" | "month";

export interface Period {
  kind: PeriodKind;
  start: string; // first day, inclusive
  end: string; // last day, inclusive
  label: string; // "Week of Nov 9" / "November"
}

export const MONTHLY_BILLABLE_TARGET = 180;

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

function utc(iso: string): Date {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** The week (Monday through Sunday) or calendar month containing `day`. */
export function periodOf(kind: PeriodKind, day: string): Period {
  if (kind === "week") {
    const dow = utc(day).getUTCDay(); // 0 = Sunday
    const start = addDays(day, -((dow + 6) % 7));
    const [, m, d] = parts(start);
    return { kind, start, end: addDays(start, 6), label: `Week of ${MO[m - 1]} ${d}` };
  }
  const [y, m] = parts(day);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = iso(new Date(Date.UTC(y, m, 0)));
  return { kind, start, end, label: MONTHS[m - 1] };
}

export function isWorkday(day: string): boolean {
  const dow = utc(day).getUTCDay();
  return dow !== 0 && dow !== 6;
}

/** Workdays (Mon–Fri) from `start` through `end`, inclusive. */
export function workdays(start: string, end: string): number {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (isWorkday(d)) n++;
  return n;
}

/** Share of the period's workdays that are behind us by the end of `today` (0–1). */
export function elapsedShare(p: Period, today: string): number {
  if (today < p.start) return 0;
  if (today >= p.end) return 1;
  const total = workdays(p.start, p.end);
  return total ? workdays(p.start, today) / total : 1;
}

/** Billable target for a period: each workday is worth its month's 180 / workdays. */
export function billableTarget(p: Period, monthly = MONTHLY_BILLABLE_TARGET): number {
  let t = 0;
  for (let d = p.start; d <= p.end; d = addDays(d, 1)) {
    if (!isWorkday(d)) continue;
    const m = periodOf("month", d);
    t += monthly / workdays(m.start, m.end);
  }
  return Math.round(t * 10) / 10;
}

export interface Ring {
  key: string;
  title: string; // "Tasks"
  period: Period;
  done: number;
  target: number;
  unit: "count" | "hours";
  pace: number; // where he'd be by today on an even pace, same unit as done
  note?: string; // shown under the ring (e.g. "sheet unavailable")
}

export interface RingTask {
  type: string;
  status: string;
  doDate: string | null;
}

/** Tasks ring: Tasks and Deadlines dated in the period, and how many are Done. */
export function tasksRing(p: Period, tasks: RingTask[], today: string): Ring {
  const inPeriod = tasks.filter(
    (t) =>
      t.doDate &&
      t.doDate >= p.start &&
      t.doDate <= p.end &&
      t.type !== "Event" &&
      t.status !== "Cancelled" &&
      t.status !== "Someday"
  );
  const done = inPeriod.filter((t) => t.status === "Done").length;
  // Even pace for tasks follows their dates: everything dated before today should be done
  // (today's items are still in play).
  const pace = inPeriod.filter((t) => t.doDate! < today).length;
  return { key: `tasks-${p.kind}`, title: "Tasks", period: p, done, target: inPeriod.length, unit: "count", pace };
}

/** Billable ring: hours on the sheet in the period against the 180-a-month target. */
export function billableRing(
  p: Period,
  byDay: Record<string, number> | null,
  today: string,
  monthly = MONTHLY_BILLABLE_TARGET
): Ring {
  const target = billableTarget(p, monthly);
  const base = { key: `billable-${p.kind}`, title: "Billable", period: p, target, unit: "hours" as const };
  if (!byDay) return { ...base, done: 0, pace: 0, note: "Hours sheet unavailable" };
  let done = 0;
  for (const [d, h] of Object.entries(byDay)) if (d >= p.start && d <= p.end) done += h;
  return { ...base, done: Math.round(done * 100) / 100, pace: Math.round(target * elapsedShare(p, today) * 10) / 10 };
}

/** 0–1 fill, capped at 1. An empty target shows an empty ring. */
export function fill(r: Ring): number {
  if (r.target <= 0) return 0;
  return Math.min(1, r.done / r.target);
}

/** On pace when done has kept up with the even-pace mark. */
export function onPace(r: Ring): boolean {
  return r.done + 1e-9 >= r.pace;
}
