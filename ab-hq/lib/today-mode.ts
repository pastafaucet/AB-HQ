// Today has three modes: the morning ritual, the day, and the evening ritual.
// With no explicit choice, the time of day picks one. A choice Andy makes by
// hand sticks for the rest of that time band (same date, same band), so
// leaving and coming back doesn't bounce him to a mode he just left.

export type TodayMode = "start" | "today" | "wind";

export const TODAY_MODES: { key: TodayMode; label: string }[] = [
  { key: "start", label: "Start of Day" },
  { key: "today", label: "Today" },
  { key: "wind", label: "Wind Down" },
];

export const TODAY_MODE_COOKIE = "abhq_today_mode";

export function isTodayMode(v: unknown): v is TodayMode {
  return v === "start" || v === "today" || v === "wind";
}

/** The mode the clock suggests: before 11am Start of Day, from 6pm Wind Down. */
export function bandFor(hour: number): TodayMode {
  if (hour < 11) return "start";
  if (hour >= 18) return "wind";
  return "today";
}

/** Cookie value recording a hand-picked mode for this date and band. */
export function modeCookieValue(date: string, hour: number, mode: TodayMode): string {
  return `${date}|${bandFor(hour)}|${mode}`;
}

/** Resolve the mode: explicit ?mode= wins, then a choice made this band, then the clock. */
export function resolveTodayMode(
  param: string | undefined,
  cookie: string | undefined,
  date: string,
  hour: number
): TodayMode {
  if (isTodayMode(param)) return param;
  if (cookie) {
    const [d, band, mode] = cookie.split("|");
    if (d === date && band === bandFor(hour) && isTodayMode(mode)) return mode;
  }
  return bandFor(hour);
}

/** Today's date (YYYY-MM-DD) and hour in Pacific time — the app's clock. */
export function pacificNow(): { date: string; hour: number } {
  const now = new Date();
  const tz = "America/Los_Angeles";
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now)
  );
  return { date, hour };
}

/** Remember a hand-picked mode for the rest of this time band (browser only). */
export function rememberTodayMode(mode: TodayMode) {
  const { date, hour } = pacificNow();
  document.cookie = `${TODAY_MODE_COOKIE}=${encodeURIComponent(
    modeCookieValue(date, hour, mode)
  )}; path=/; max-age=86400; samesite=lax`;
}
