// Natural-language quick-add parsing: "Call Bob tomorrow at 2:30" →
// { title: "Call Bob", doDate: <tomorrow>, doTime: "14:30" }.
// Pure string/date logic — no deps, safe on client and server.

export interface QuickMatter {
  id: string;
  name: string;
  client?: string;
}

export interface QuickParsed {
  title: string;
  doDate?: string; // YYYY-MM-DD
  doTime?: string; // HH:MM, 24h
  priority?: number; // 1–4, from "p1"…"p4"
  matterId?: string;
  dateLabel?: string; // "Tomorrow", "Friday", "Aug 12"
  timeLabel?: string; // "2:30 PM"
  matterLabel?: string; // matched matter name
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const WEEKDAY_ABBR: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  weds: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6,
};
// Short forms that are also common English words — only accepted with a
// leading "on/next/this" so "sat down" or "mon" in a name don't trigger.
const RISKY_ABBR = new Set(["mon", "sat", "sun"]);

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTH_INDEX: Record<string, number> = {};
[
  ["jan", "january"],
  ["feb", "february"],
  ["mar", "march"],
  ["apr", "april"],
  ["may", "may"],
  ["jun", "june"],
  ["jul", "july"],
  ["aug", "august"],
  ["sep", "sept", "september"],
  ["oct", "october"],
  ["nov", "november"],
  ["dec", "december"],
].forEach((names, i) => names.forEach((n) => (MONTH_INDEX[n] = i)));

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

/** No meridiem given: 1–7 reads as afternoon/evening, 8–11 as morning. */
function inferHour(h: number, meridiem: string | null): number {
  if (meridiem) {
    const pm = meridiem.startsWith("p");
    if (h === 12) return pm ? 12 : 0;
    return pm ? h + 12 : h;
  }
  if (h >= 1 && h <= 7) return h + 12;
  return h; // 0, 8–23 as written
}

function timeLabelFor(hhmm: string): string {
  const [hStr, m] = hhmm.split(":");
  let h = Number(hStr);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return m === "00" ? `${h} ${ap}` : `${h}:${m} ${ap}`;
}

function dateLabelFor(iso: string, todayIso: string): string {
  const today = fromISO(todayIso);
  const d = fromISO(iso);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return WEEKDAYS[d.getDay()][0].toUpperCase() + WEEKDAYS[d.getDay()].slice(1);
  const base = `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === today.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

interface DateHit {
  index: number;
  length: number;
  iso: string;
}

function findDate(text: string, today: Date, todayIso: string): DateHit | null {
  let m: RegExpExecArray | null;

  m = /\b(?:on\s+)?(today|tonight)\b/i.exec(text);
  if (m) return { index: m.index, length: m[0].length, iso: todayIso };

  m = /\b(?:on\s+)?(tomorrow|tmrw|tmw|tmr)\b/i.exec(text);
  if (m) return { index: m.index, length: m[0].length, iso: toISO(addDays(today, 1)) };

  m = /\bin\s+(\d{1,2})\s+(day|days|week|weeks)\b/i.exec(text);
  if (m) {
    const n = Number(m[1]) * (m[2].toLowerCase().startsWith("week") ? 7 : 1);
    return { index: m.index, length: m[0].length, iso: toISO(addDays(today, n)) };
  }

  m =
    /\b(?:(on|next|this)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|weds?|thu(?:rs?)?|fri|sat|sun)\b/i.exec(
      text
    );
  if (m) {
    const prefix = m[1]?.toLowerCase() ?? null;
    const word = m[2].toLowerCase();
    const target = word in WEEKDAY_ABBR ? WEEKDAY_ABBR[word] : WEEKDAYS.indexOf(word);
    const ok = !(RISKY_ABBR.has(word) && !prefix);
    if (ok && target >= 0) {
      let ahead = (target - today.getDay() + 7) % 7;
      if (prefix === "next") ahead = ahead === 0 ? 7 : ahead + 7;
      return { index: m.index, length: m[0].length, iso: toISO(addDays(today, ahead)) };
    }
  }

  m =
    /\b(?:on\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(
      text
    );
  if (m) {
    const mo = MONTH_INDEX[m[1].toLowerCase().slice(0, 4)] ?? MONTH_INDEX[m[1].toLowerCase().slice(0, 3)];
    const day = Number(m[2]);
    if (mo !== undefined && day >= 1 && day <= 31) {
      let d = new Date(today.getFullYear(), mo, day);
      if (d < today) d = new Date(today.getFullYear() + 1, mo, day);
      return { index: m.index, length: m[0].length, iso: toISO(d) };
    }
  }

  m = /\b(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text);
  if (m) {
    const mo = Number(m[1]) - 1;
    const day = Number(m[2]);
    if (mo >= 0 && mo <= 11 && day >= 1 && day <= 31) {
      let year = m[3] ? Number(m[3]) : today.getFullYear();
      if (m[3] && year < 100) year += 2000;
      let d = new Date(year, mo, day);
      if (!m[3] && d < today) d = new Date(year + 1, mo, day);
      return { index: m.index, length: m[0].length, iso: toISO(d) };
    }
  }

  m = /\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/i.exec(text);
  if (m) {
    const day = Number(m[1]);
    if (day >= 1 && day <= 31) {
      let d = new Date(today.getFullYear(), today.getMonth(), day);
      if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, day);
      return { index: m.index, length: m[0].length, iso: toISO(d) };
    }
  }

  return null;
}

interface TimeHit {
  index: number;
  length: number;
  hhmm: string;
}

function findTime(text: string): TimeHit | null {
  let m: RegExpExecArray | null;

  // "2:30", "at 2:30pm", "14:00", "2:30p"
  m = /\b(?:at\s+|@\s*)?(\d{1,2}):(\d{2})(?:\s*(am|pm|a\.m\.|p\.m\.)|([ap]))?\b/i.exec(text);
  if (m) {
    const min = Number(m[2]);
    const mer = (m[3] ?? m[4])?.toLowerCase() ?? null;
    const h = inferHour(Number(m[1]), mer);
    if (h <= 23 && min <= 59)
      return {
        index: m.index,
        length: m[0].length,
        hhmm: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
      };
  }

  // "5pm", "at 5 pm", "5p"
  m = /\b(?:at\s+|@\s*)?(\d{1,2})(?:\s*(am|pm|a\.m\.|p\.m\.)|([ap]))\b/i.exec(text);
  if (m) {
    const h = inferHour(Number(m[1]), (m[2] ?? m[3]).toLowerCase());
    if (h <= 23)
      return { index: m.index, length: m[0].length, hhmm: `${String(h).padStart(2, "0")}:00` };
  }

  m = /\b(?:at\s+)?(noon|midnight)\b/i.exec(text);
  if (m)
    return {
      index: m.index,
      length: m[0].length,
      hhmm: m[1].toLowerCase() === "noon" ? "12:00" : "00:00",
    };

  // Bare "at 2" — only with the explicit "at", so plain numbers stay in titles.
  m = /\b(?:at|@)\s+(\d{1,2})\b(?!\s*(?:st|nd|rd|th)\b)(?!\s*[\/:%])/i.exec(text);
  if (m) {
    const h = inferHour(Number(m[1]), null);
    if (h <= 23)
      return { index: m.index, length: m[0].length, hhmm: `${String(h).padStart(2, "0")}:00` };
  }

  return null;
}

interface PriorityHit {
  index: number;
  length: number;
  priority: number;
}

function findPriority(text: string): PriorityHit | null {
  const m = /(?:^|[\s,])[pP]([1-4])\b/.exec(text);
  if (!m) return null;
  const offset = m[0].length - 2; // leading separator, if any
  return { index: m.index + offset, length: 2, priority: Number(m[1]) };
}

// Words in matter/client names too generic to identify a case on their own.
const MATTER_STOPWORDS = new Set([
  "the", "of", "and", "for", "in", "re", "a", "an",
  "v", "vs", "llc", "inc", "llp", "co", "corp", "company",
  "matter", "case", "estate", "trust",
]);

interface MatterHit {
  index: number;
  length: number;
  id: string;
  name: string;
}

function wordsOf(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9][a-z0-9''-]*/g) ?? [];
}

function isBoundary(ch: string | undefined): boolean {
  return ch === undefined || !/[a-z0-9]/i.test(ch);
}

/**
 * Match the input against known matters: the full matter name (or full
 * client name) appearing verbatim wins; otherwise a single word that
 * belongs to exactly one matter's NAME — e.g. "smith" → "Smith v. Acme
 * Corp". Client names never match by single word: first names like "bob"
 * show up in unrelated titles ("call bob") far too often.
 */
function findMatter(text: string, matters: QuickMatter[]): MatterHit | null {
  const lower = text.toLowerCase();

  // 1) Full matter or client name verbatim (longest first).
  const verbatim: { phrase: string; mt: QuickMatter }[] = [];
  for (const mt of matters) {
    verbatim.push({ phrase: mt.name.trim().toLowerCase(), mt });
    const client = mt.client?.trim().toLowerCase();
    if (client && wordsOf(client).length > 1) verbatim.push({ phrase: client, mt });
  }
  verbatim.sort((a, b) => b.phrase.length - a.phrase.length);
  for (const { phrase, mt } of verbatim) {
    if (phrase.length < 3) continue;
    const i = lower.indexOf(phrase);
    if (i >= 0 && isBoundary(lower[i - 1]) && isBoundary(lower[i + phrase.length])) {
      return { index: i, length: phrase.length, id: mt.id, name: mt.name };
    }
  }

  // 2) A distinctive single word, unique to one matter's name.
  const owner = new Map<string, QuickMatter | null>(); // word → matter, or null if shared
  for (const mt of matters) {
    const seen = new Set<string>();
    for (const w of wordsOf(mt.name)) {
      if (w.length < 3 || MATTER_STOPWORDS.has(w) || seen.has(w)) continue;
      seen.add(w);
      owner.set(w, owner.has(w) && owner.get(w)?.id !== mt.id ? null : mt);
    }
  }

  let best: MatterHit | null = null;
  const re = /[a-z0-9][a-z0-9''-]*/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const w = m[0].toLowerCase();
    const mt = owner.get(w);
    if (mt && (!best || m[0].length > best.length)) {
      best = { index: m.index, length: m[0].length, id: mt.id, name: mt.name };
    }
  }
  return best;
}

function cut(text: string, index: number, length: number): string {
  return `${text.slice(0, index)} ${text.slice(index + length)}`;
}

function cleanTitle(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+(at|on|by|from|re|for)\s*$/i, "") // dangling connectors
    .replace(/^\s*(at|on)\s+/i, "")
    .replace(/[\s,;\-–—]+$/g, "")
    .replace(/^[\s,;]+/g, "")
    .trim();
}

export function parseQuickAdd(
  raw: string,
  todayIso: string,
  matters: QuickMatter[] = []
): QuickParsed {
  const today = fromISO(todayIso);
  let text = raw;

  const date = findDate(text, today, todayIso);
  if (date) text = cut(text, date.index, date.length);

  const time = findTime(text);
  if (time) text = cut(text, time.index, time.length);

  const pri = findPriority(text);
  if (pri) text = cut(text, pri.index, pri.length);

  const matter = findMatter(text, matters);
  if (matter) text = cut(text, matter.index, matter.length);

  const title = cleanTitle(text) || raw.trim();

  return {
    title,
    doDate: date?.iso,
    doTime: time?.hhmm,
    priority: pri?.priority,
    matterId: matter?.id,
    dateLabel: date ? dateLabelFor(date.iso, todayIso) : undefined,
    timeLabel: time ? timeLabelFor(time.hhmm) : undefined,
    matterLabel: matter?.name,
  };
}
