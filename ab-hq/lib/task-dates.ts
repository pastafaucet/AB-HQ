// Date-span helpers for tasks. A task covers one day (do_date) unless it
// carries an end_date, in which case it covers every day through it.
// Pure logic, safe on client and server.

type Span = { doDate?: string | null; endDate?: string | null };

/** The last day a task covers. */
export function lastDay(t: Span): string | undefined {
  if (!t.doDate) return undefined;
  return t.endDate && t.endDate > t.doDate ? t.endDate : t.doDate;
}

/** Does the task cover this day (YYYY-MM-DD)? */
export function coversDay(t: Span, iso: string): boolean {
  const last = lastDay(t);
  return !!t.doDate && !!last && t.doDate <= iso && iso <= last;
}

/** Past due only once its last day has passed. */
export function isPastDue(t: Span, today: string): boolean {
  const last = lastDay(t);
  return !!last && last < today;
}

/** Does it span more than one day? */
export function isMultiDay(t: Span): boolean {
  return !!t.doDate && !!t.endDate && t.endDate > t.doDate;
}

/** Shift a YYYY-MM-DD date by whole days. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Whole days from a to b. */
export function daysBetween(a: string, b: string): number {
  const ms = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(b) - ms(a)) / 86400000);
}
