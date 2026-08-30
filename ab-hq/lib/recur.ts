// Recurrence rules — parse "every tuesday" phrases, compute next
// occurrences, and describe rules for display. Pure logic, client-safe.
//
// Stored on tasks.recur as a JSON string:
//   {"freq":"daily"|"weekly"|"monthly"|"yearly","interval":1,"byDay":[2],"byMonthDay":15}
// byDay: 0=Sun … 6=Sat (multiple for "every weekday").

export interface RecurRule {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  byDay?: number[];
  byMonthDay?: number;
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_INDEX: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, weds: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

export function parseRule(json: string | undefined | null): RecurRule | null {
  if (!json) return null;
  try {
    const r = JSON.parse(json) as RecurRule;
    if (!["daily", "weekly", "monthly", "yearly"].includes(r.freq)) return null;
    return { ...r, interval: r.interval ?? 1 };
  } catch {
    return null;
  }
}

export function ruleToJson(rule: RecurRule): string {
  return JSON.stringify(rule);
}

function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** The next occurrence strictly AFTER fromIso. */
export function nextOccurrence(rule: RecurRule, fromIso: string): string {
  const from = fromISO(fromIso);
  const interval = Math.max(1, rule.interval ?? 1);

  if (rule.freq === "daily") return toISO(addDays(from, interval));

  if (rule.freq === "weekly") {
    const byDay = rule.byDay && rule.byDay.length ? rule.byDay : [from.getDay()];
    if (byDay.length > 1 || interval === 1) {
      // Scan forward day by day (multi-day rules assume weekly cadence).
      for (let i = 1; i <= 7; i++) {
        const d = addDays(from, i);
        if (byDay.includes(d.getDay())) return toISO(d);
      }
    }
    // Single day, every N weeks: align to the day, then add remaining weeks.
    const target = byDay[0];
    let ahead = (target - from.getDay() + 7) % 7;
    if (ahead === 0) ahead = 7 * interval;
    else if (interval > 1) ahead += 7 * (interval - 1);
    return toISO(addDays(from, ahead));
  }

  if (rule.freq === "monthly") {
    const day = rule.byMonthDay ?? from.getDate();
    for (let k = 0; k <= 24; k++) {
      const m = new Date(from.getFullYear(), from.getMonth() + k * interval, 1);
      const dim = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      const d = new Date(m.getFullYear(), m.getMonth(), Math.min(day, dim));
      if (d > from) return toISO(d);
    }
  }

  if (rule.freq === "yearly") {
    const d = new Date(from.getFullYear() + interval, from.getMonth(), from.getDate());
    return toISO(d);
  }

  return toISO(addDays(from, 1));
}

/** First occurrence on or after fromIso (for scheduling a new rule with no explicit date). */
export function firstOccurrence(rule: RecurRule, fromIso: string): string {
  const from = fromISO(fromIso);
  if (rule.freq === "weekly" && rule.byDay?.length) {
    for (let i = 0; i <= 7; i++) {
      const d = addDays(from, i);
      if (rule.byDay.includes(d.getDay())) return toISO(d);
    }
  }
  if (rule.freq === "monthly" && rule.byMonthDay) {
    if (from.getDate() <= rule.byMonthDay) {
      const dim = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
      return toISO(new Date(from.getFullYear(), from.getMonth(), Math.min(rule.byMonthDay, dim)));
    }
    return nextOccurrence(rule, fromIso);
  }
  return fromIso; // daily / yearly / plain weekly start today
}

export function describeRule(rule: RecurRule): string {
  const n = Math.max(1, rule.interval ?? 1);
  if (rule.freq === "daily") return n === 1 ? "daily" : `every ${n} days`;
  if (rule.freq === "weekly") {
    const days = rule.byDay ?? [];
    if (days.length === 5 && !days.includes(0) && !days.includes(6)) return "every weekday";
    const names = days.map((d) => DOW_SHORT[d]).join("/");
    if (n === 1) return names ? `every ${names}` : "weekly";
    return `every ${n} wks${names ? ` (${names})` : ""}`;
  }
  if (rule.freq === "monthly")
    return rule.byMonthDay ? `monthly on the ${rule.byMonthDay}` : "monthly";
  return "yearly";
}

export interface RecurHit {
  index: number;
  length: number;
  rule: RecurRule;
  label: string;
}

/** Find a recurrence phrase in free text: "every tuesday", "daily", "every 2 weeks", "monthly on the 15th"… */
export function findRecurPhrase(text: string): RecurHit | null {
  let m: RegExpExecArray | null;
  const mk = (m: RegExpExecArray, rule: RecurRule): RecurHit => ({
    index: m.index,
    length: m[0].length,
    rule,
    label: describeRule(rule),
  });

  m = /\bevery\s+weekday\b/i.exec(text);
  if (m) return mk(m, { freq: "weekly", interval: 1, byDay: [1, 2, 3, 4, 5] });

  m = /\b(?:every\s+day|daily)\b/i.exec(text);
  if (m) return mk(m, { freq: "daily", interval: 1 });

  m =
    /\bevery\s+(other\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|weds?|thu(?:rs?)?|fri|sat|sun)s?\b/i.exec(
      text
    );
  if (m) {
    const day = DOW_INDEX[m[2].toLowerCase()];
    if (day !== undefined)
      return mk(m, { freq: "weekly", interval: m[1] ? 2 : 1, byDay: [day] });
  }

  m = /\bevery\s+(other\s+week|week|(\d+)\s+weeks?)\b/i.exec(text);
  if (m) {
    const interval = m[2] ? Number(m[2]) : /other/i.test(m[1]) ? 2 : 1;
    if (interval >= 1 && interval <= 12) return mk(m, { freq: "weekly", interval });
  }

  m = /\b(?:every\s+month|monthly)(?:\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?)?\b/i.exec(text);
  if (m) {
    const day = m[1] ? Number(m[1]) : undefined;
    if (!day || (day >= 1 && day <= 31))
      return mk(m, { freq: "monthly", interval: 1, byMonthDay: day });
  }

  m = /\b(?:every\s+year|yearly|annually)\b/i.exec(text);
  if (m) return mk(m, { freq: "yearly", interval: 1 });

  return null;
}
