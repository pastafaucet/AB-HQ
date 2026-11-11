// Time entries typed into Capture, parsed for the "2021 AB Daily Hours" sheet.
// Pure logic: no imports, safe on client and server, unit-tested in
// lib/time-entry.test.ts. The rules come from Andy's spec (Nov 2026):
//   "<matter> - <task> (<time>)", tasks separated by ";", one entry per line;
//   times may sit mid-sentence; a bare integer like "(4)" is ambiguous.
// Never guess: anything uncertain becomes a question for Andy.

export interface ClientRow {
  name: string; // canonical Clients!A
  billable: boolean; // Clients!B
  increment: number; // Clients!C (0.1 or 0.25)
  aliases: string[]; // Clients!D "Also typed as" (read only)
  active: boolean; // Clients!E
}

export interface AliasRow {
  typed: string;
  canonical: string;
}

export type Question =
  | { kind: "matter"; typed: string | null; options: string[] }
  | { kind: "bare-integer"; value: number }
  | { kind: "increment"; total: number; increment: number; options: number[] }
  | { kind: "total-mismatch"; given: number; sum: number }
  | { kind: "missing-time"; task: string }
  | { kind: "date"; text: string };

export interface ParsedTask {
  text: string; // the task's words, time tokens marked as {{n}}
  hours: number; // sum of its times
  times: number[]; // each time token, in order (ambiguous ones as typed)
}

export interface ParsedEntry {
  line: string; // the raw line
  date: string; // YYYY-MM-DD
  typedMatter: string | null;
  client: string | null; // canonical Clients name, once known
  givenTotal: number | null;
  tasks: ParsedTask[];
  hours: number | null;
  description: string;
  fixes: string[]; // capitalization fixes made ("PRepare → Prepare")
  questions: Question[];
}

export interface ParseContext {
  today: string; // YYYY-MM-DD, Pacific
  clients: ClientRow[];
  aliases: AliasRow[];
  defaultDate?: { date: string; question?: Question }; // from a date-only line above
}

// "(.4)", "(1.3)", "(0.75)", "(4)", "(1.3 total)", "(total 1.3)"
const TOKEN = /\(\s*(total\s+)?(\d*\.\d+|\d+(?:\.\d+)?)(\s*(?:total|hrs?|hours?))?\s*\)/gi;

/** Does this capture contain a time in parentheses? */
export function hasTimeEntry(text: string): boolean {
  return /\(\s*(?:total\s+)?(?:\d*\.\d+|\d+(?:\.\d+)?)(?:\s*(?:total|hrs?|hours?))?\s*\)/i.test(text);
}

const EPS = 1e-6;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Sheet style for a time: ".4", ".75", "1.3", "1.0". */
export function formatHours(n: number): string {
  const r = round2(n);
  if (Number.isInteger(r)) return r.toFixed(1);
  const s = String(r);
  return s.startsWith("0.") ? s.slice(1) : s;
}

/**
 * The times written in a description, the way the sheet's Check column reads
 * them: decimals in parentheses only, "(.3)" or "(1.0)". Also reports any
 * bare whole number "(1)", which the sheet doesn't count.
 */
export function descriptionTimes(desc: string): { sum: number; count: number; bareIntegers: string[] } {
  let sum = 0;
  let count = 0;
  for (const m of desc.matchAll(/\((\d*\.\d+)\)/g)) {
    sum += Number(m[1].startsWith(".") ? `0${m[1]}` : m[1]);
    count++;
  }
  const bareIntegers = [...desc.matchAll(/\((\d+)\)/g)].map((m) => m[0]);
  return { sum: Math.round(sum * 100) / 100, count, bareIntegers };
}

/** Hours with two decimals, for messages ("0.75", "1.30"). */
export function hoursLabel(n: number): string {
  return round2(n).toFixed(2);
}

export function isCleanMultiple(n: number, inc: number): boolean {
  const q = n / inc;
  return Math.abs(q - Math.round(q)) < 1e-4;
}

/** M/D/YYYY from YYYY-MM-DD (what the sheet is written with). */
export function toSheetDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

/** "Wed 11/4" from YYYY-MM-DD. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dow} ${m}/${d}`;
}

// ---------------------------------------------------------------- dates

const DOW: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3,
  wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};

function isoShift(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function dowOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * A date at the start of a line: "yesterday", "last Wed", "Wed", "10/1",
 * "Fri 10/30", "11/4/2026". Returns the date, the rest of the line, and a
 * question when the date can't be trusted (a weekday that doesn't match, a
 * future date).
 */
export function parseDatePrefix(
  line: string,
  today: string
): { date: string; rest: string; question?: Question } {
  const sep = String.raw`(?:\s*[:,\-–—]\s*|\s+)`;
  let m = line.match(new RegExp(String.raw`^(today|yesterday)` + sep + "(.*)$", "is"));
  if (m) {
    return { date: m[1].toLowerCase() === "today" ? today : isoShift(today, -1), rest: m[2] };
  }
  const dowNames = Object.keys(DOW).sort((a, b) => b.length - a.length).join("|");
  // weekday + numeric date ("Fri 10/30"), or numeric date alone
  m = line.match(
    new RegExp(String.raw`^(?:(${dowNames})\.?\s+)?(\d{1,2})/(\d{1,2})(?:/(\d{2}|\d{4}))?` + sep + "(.*)$", "is")
  );
  if (m) {
    const [, dowWord, mm, dd, yy, rest] = m;
    const ty = Number(today.slice(0, 4));
    const year = yy ? (yy.length === 2 ? 2000 + Number(yy) : Number(yy)) : ty;
    const month = Number(mm);
    const day = Number(dd);
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const valid =
      month >= 1 && month <= 12 && day >= 1 && day <= 31 &&
      new Date(Date.UTC(year, month - 1, day)).getUTCDate() === day;
    const text = line.slice(0, line.length - rest.length).trim();
    if (!valid) return { date: today, rest, question: { kind: "date", text } };
    if (dowWord && DOW[dowWord.toLowerCase()] !== dowOf(iso))
      return { date: iso, rest, question: { kind: "date", text } };
    if (iso > today) return { date: iso, rest, question: { kind: "date", text } };
    return { date: iso, rest };
  }
  // "last Wed" (strictly before today) or "Wed" (most recent, today included)
  m = line.match(new RegExp(String.raw`^(last\s+)?(${dowNames})\.?` + sep + "(.*)$", "is"));
  if (m) {
    const want = DOW[m[2].toLowerCase()];
    let back = (dowOf(today) - want + 7) % 7;
    if (m[1] && back === 0) back = 7;
    return { date: isoShift(today, -back), rest: m[3] };
  }
  return { date: today, rest: line };
}

// ---------------------------------------------------------------- matter

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function parseAliasCell(cell: string): string[] {
  const body = cell.replace(/^\s*also typed as:\s*/i, "").replace(/\(\+\d+ more\)\s*$/i, "");
  return body
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Match shorthand to a Clients name: alias table, exact, column D, after the slash. */
export function resolveMatter(
  typed: string,
  clients: ClientRow[],
  aliases: AliasRow[]
): { client: string | null; options: string[] } {
  const t = norm(typed);
  if (!t) return { client: null, options: [] };
  const byName = new Map(clients.map((c) => [norm(c.name), c]));
  const pick = (names: string[]) => {
    const found = [...new Set(names)].map((n) => byName.get(norm(n))).filter(Boolean) as ClientRow[];
    if (found.length === 0) return null;
    if (found.length === 1) return { client: found[0].name, options: [] };
    const active = found.filter((c) => c.active);
    if (active.length === 1) return { client: active[0].name, options: [] };
    return { client: null, options: (active.length ? active : found).map((c) => c.name) };
  };
  const steps: string[][] = [
    aliases.filter((a) => norm(a.typed) === t).map((a) => a.canonical),
    clients.filter((c) => norm(c.name) === t).map((c) => c.name),
    clients.filter((c) => c.aliases.some((a) => norm(a) === t)).map((c) => c.name),
    clients.filter((c) => c.name.includes("/") && norm(c.name.split("/").slice(1).join("/")) === t).map((c) => c.name),
  ];
  for (const names of steps) {
    const r = pick(names);
    if (r) return r;
  }
  return { client: null, options: suggestMatters(typed, clients) };
}

/** True when shorthand resolves by an exact rule (alias table, name, column D, after-slash), not a guess. */
function exactMatch(typed: string, ctx: ParseContext): boolean {
  const t = norm(typed);
  return (
    ctx.aliases.some((a) => norm(a.typed) === t) ||
    ctx.clients.some(
      (c) =>
        norm(c.name) === t ||
        c.aliases.some((a) => norm(a) === t) ||
        (c.name.includes("/") && norm(c.name.split("/").slice(1).join("/")) === t)
    )
  );
}

/** Likely matters for an unknown shorthand: names or aliases sharing a word. */
export function suggestMatters(typed: string, clients: ClientRow[]): string[] {
  const words = norm(typed)
    .split(/[\s/\-–—]+/)
    .filter((w) => w.length >= 3);
  if (!words.length) return [];
  const score = (c: ClientRow) => {
    const hay = norm([c.name, ...c.aliases].join(" "));
    return words.filter((w) => hay.includes(w)).length;
  };
  return clients
    .map((c) => ({ c, s: score(c) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || Number(b.c.active) - Number(a.c.active) || a.c.name.localeCompare(b.c.name))
    .slice(0, 6)
    .map((x) => x.c.name);
}

/** Split "<matter> - <rest>": the longest leading part that resolves wins. */
function splitMatter(
  line: string,
  ctx: ParseContext
): { typed: string | null; rest: string; client: string | null; options: string[] } {
  const seps = [...line.matchAll(/\s+[-–—]\s+|\s*:\s+/g)];
  let best: { typed: string; rest: string; client: string; idx: number } | null = null;
  let firstAmbiguous: { typed: string; rest: string; options: string[] } | null = null;
  for (const s of seps) {
    const typed = line.slice(0, s.index).trim();
    if (!typed || hasTimeEntry(typed)) break;
    const r = resolveMatter(typed, ctx.clients, ctx.aliases);
    const rest = line.slice((s.index ?? 0) + s[0].length);
    if (r.client && (!best || typed.length > best.typed.length)) best = { typed, rest, client: r.client, idx: s.index ?? 0 };
    else if (!r.client && r.options.length && !firstAmbiguous) firstAmbiguous = { typed, rest, options: r.options };
  }
  if (best) return { typed: best.typed, rest: best.rest, client: best.client, options: [] };
  // No dash: a known matter name (exact name, alias, or Clients!D) at the very
  // start, e.g. "Cedars/Huntington emails from Elspeth (.1)". Longest wins;
  // fuzzy suggestions never count here.
  const words = line.split(/\s+/);
  for (let n = Math.min(4, words.length - 1); n >= 1; n--) {
    const typed = words.slice(0, n).join(" ");
    if (hasTimeEntry(typed)) continue;
    const r = resolveMatter(typed, ctx.clients, ctx.aliases);
    if (r.client && exactMatch(typed, ctx)) return { typed, rest: words.slice(n).join(" "), client: r.client, options: [] };
  }
  if (seps.length && !hasTimeEntry(line.slice(0, seps[0].index))) {
    const typed = line.slice(0, seps[0].index).trim();
    const rest = line.slice((seps[0].index ?? 0) + seps[0][0].length);
    const options = firstAmbiguous?.typed === typed ? firstAmbiguous.options : resolveMatter(typed, ctx.clients, ctx.aliases).options;
    return { typed, rest, client: null, options };
  }
  return { typed: null, rest: line, client: null, options: [] };
}

// ---------------------------------------------------------------- description

// Ordinary words that open a task. After "; " these are lowercased ("; Call
// with" → "; call with"); anything else (names like "Brown Greer", "Jason",
// acronyms) keeps its capital.
const TASK_WORDS = new Set(
  (
    "address analysis analyze answer appear arrange attend begin brief call calls calendar check circulate " +
    "communicate complete conduct confer conference confirm consider continue coordinate correspond correspondence " +
    "deposition determine discuss discussion download draft edit email emails exchange file finalize follow " +
    "gather handle identify incorporate investigate letter locate look manage meet meeting memo note obtain " +
    "organize outline participate plan prep prepare proofread provide read receive reply report request " +
    "research respond response review revise schedule send serve set speak start status strategize strategy " +
    "submit summarize summary talk telephone text texts travel update work write zoom"
  ).split(" ")
);

/** "Call with Jonathan" → "call with Jonathan" when it follows "; ". Names and acronyms are left alone. */
export function lowerTaskStart(s: string): string {
  const m = s.match(/^([A-Z])([a-z'’]+)(\b|$)/);
  if (!m || !TASK_WORDS.has((m[1] + m[2]).toLowerCase())) return s;
  return m[1].toLowerCase() + s.slice(1);
}

/** "PRepare" → "Prepare": two leading capitals then lowercase. Acronyms untouched. */
function fixStrayCapitals(s: string, fixes: string[]): string {
  return s.replace(/\b([A-Z])([A-Z])([a-z]{2,})\b/g, (w, a, b, rest) => {
    const fixed = a + b.toLowerCase() + rest;
    fixes.push(`${w} → ${fixed}`);
    return fixed;
  });
}

function tidy(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+([;,.])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

/**
 * The F column text. One task: no time in parentheses. Two or more tasks (or
 * one task with several times): every time kept, in sheet style. RS/General:
 * no per-task times at all. Andy's wording otherwise, first letter capitalized.
 */
export function buildDescription(tasks: ParsedTask[], client: string | null): string {
  const timeCount = tasks.reduce((n, t) => n + t.times.length, 0);
  const keepTimes = client !== "RS/General" && (tasks.length > 1 || timeCount > 1);
  const parts = tasks.map((t) => {
    let i = 0;
    const s = t.text.replace(/\{\{t\}\}/g, () => {
      const h = t.times[i++];
      return keepTimes ? `(${formatHours(h)})` : "";
    });
    return tidy(s);
  });
  const joined = parts
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p : lowerTaskStart(p)))
    .join("; ");
  return joined ? joined.charAt(0).toUpperCase() + joined.slice(1) : joined;
}

// ---------------------------------------------------------------- the parse

function parseLine(lineRaw: string, ctx: ParseContext): ParsedEntry {
  const questions: Question[] = [];
  const fixes: string[] = [];
  const line = lineRaw.trim();
  const own = parseDatePrefix(line, ctx.today);
  const hasOwnDate = own.rest !== line;
  const d = hasOwnDate || !ctx.defaultDate ? own : { date: ctx.defaultDate.date, rest: line, question: ctx.defaultDate.question };
  if (d.question) questions.push(d.question);
  const m = splitMatter(d.rest.trim(), ctx);
  if (!m.client) questions.push({ kind: "matter", typed: m.typed, options: m.options });

  // Pull out a stated total; mark every time token in the tasks.
  let givenTotal: number | null = null;
  const tasks: ParsedTask[] = [];
  for (const chunk of m.rest.split(";")) {
    if (!chunk.trim()) continue;
    const times: number[] = [];
    const text = chunk.replace(TOKEN, (_all, pre: string | undefined, num: string, post: string | undefined) => {
      const isTotal = !!pre || /total/i.test(post ?? "");
      const v = Number(num.startsWith(".") ? `0${num}` : num);
      if (isTotal) {
        givenTotal = v;
        return "";
      }
      if (!num.includes(".")) questions.push({ kind: "bare-integer", value: v });
      times.push(v);
      return "{{t}}";
    });
    tasks.push({ text: fixStrayCapitals(text, fixes), hours: round2(times.reduce((a, b) => a + b, 0)), times });
  }

  const sum = round2(tasks.reduce((a, t) => a + t.hours, 0));
  if (tasks.length > 1) {
    for (const t of tasks)
      if (t.times.length === 0 && tidy(t.text.replace(/\{\{t\}\}/g, "")))
        questions.push({ kind: "missing-time", task: tidy(t.text) });
  }
  let hours: number | null = sum > 0 ? sum : null;
  if (givenTotal !== null) {
    if (sum > 0 && Math.abs(sum - givenTotal) > EPS) questions.push({ kind: "total-mismatch", given: givenTotal, sum });
    hours = givenTotal;
  }
  const hasBareInt = questions.some((q) => q.kind === "bare-integer");
  if (m.client && hours !== null && !hasBareInt) {
    const inc = ctx.clients.find((c) => c.name === m.client)?.increment ?? 0.1;
    if (!isCleanMultiple(hours, inc)) {
      const lo = round2(Math.floor(hours / inc + EPS) * inc);
      const hi = round2(Math.ceil(hours / inc - EPS) * inc);
      questions.push({ kind: "increment", total: hours, increment: inc, options: [...new Set([lo, hi])].filter((x) => x > 0) });
    }
  }

  return {
    line,
    date: d.date,
    typedMatter: m.typed,
    client: m.client,
    givenTotal,
    tasks,
    hours,
    description: buildDescription(tasks, m.client),
    fixes,
    questions,
  };
}

const DOW_RE = Object.keys(DOW).sort((a, b) => b.length - a.length).join("|");

/**
 * A date header: a line with a date but no time to log, such as "11/6",
 * "please add for 11/6:", "For Thursday 11/5:" or "yesterday". It sets the
 * date for every following line until the next header. A line that starts
 * with a known matter is an entry missing its time, never a header, and long
 * lines aren't headers either (a header is a few words around a date).
 */
export function dateHeader(line: string, ctx: ParseContext): { date: string; question?: Question } | null {
  const t = line.trim().replace(/[:,.\-–—]+$/, "").trim();
  if (!t || hasTimeEntry(t)) return null;
  if (t.split(/\s+/).length > 8) return null;
  const first = t.split(/\s+-\s+|\s*:\s+/)[0];
  if (resolveMatter(first, ctx.clients, ctx.aliases).client && exactMatch(first, ctx)) return null;
  const candidates = [
    new RegExp(String.raw`(?:\b(?:${DOW_RE})\.?\s+)?\b\d{1,2}/\d{1,2}(?:/(?:\d{4}|\d{2}))?\b`, "i"),
    /\b(?:today|yesterday)\b/i,
    new RegExp(String.raw`\b(?:last\s+)?(?:${DOW_RE})\b`, "i"),
  ];
  for (const re of candidates) {
    const m = t.match(re);
    if (!m || m.index === undefined) continue;
    const d = parseDatePrefix(`${m[0]} §`, ctx.today);
    if (d.rest.trim() === "§") return { date: d.date, question: d.question };
  }
  return null;
}

/**
 * Parse a capture into one entry per non-empty line. A date header line
 * ("11/6", "please add for 11/6:") sets the date for the lines below it (Andy typed "11/4" above three
 * entries on 2026-11-07 and they landed on today); a date at the start of an
 * entry line still wins for that line.
 */
export function parseTimeCapture(text: string, ctx: ParseContext): ParsedEntry[] {
  const out: ParsedEntry[] = [];
  let carried: { date: string; question?: Question } | null = null;
  for (const l of text.split(/\r?\n/)) {
    if (!l.trim()) continue;
    const only = dateHeader(l, ctx);
    if (only) {
      carried = only;
      continue;
    }
    out.push(parseLine(l, carried ? { ...ctx, today: ctx.today, defaultDate: carried } : ctx));
  }
  return out;
}

/**
 * Apply Andy's answers to an entry and re-check it. `bareIntegers` maps each
 * ambiguous "(4)" (in order) to the value he meant.
 */
export function applyAnswers(
  e: ParsedEntry,
  ans: { client?: string; date?: string; hours?: number; bareIntegers?: number[]; description?: string },
  ctx: ParseContext
): ParsedEntry {
  const next: ParsedEntry = { ...e, tasks: e.tasks.map((t) => ({ ...t, times: [...t.times] })), questions: [] };
  if (ans.client) next.client = ans.client;
  if (ans.date) next.date = ans.date;
  if (ans.bareIntegers?.length) {
    let k = 0;
    for (const t of next.tasks) {
      t.times = t.times.map((v) => (Number.isInteger(v) && k < ans.bareIntegers!.length ? ans.bareIntegers![k++] : v));
      t.hours = round2(t.times.reduce((a, b) => a + b, 0));
    }
  }
  const sum = round2(next.tasks.reduce((a, t) => a + t.hours, 0));
  next.hours = ans.hours ?? (next.givenTotal ?? (sum > 0 ? sum : null));
  next.description = ans.description ?? buildDescription(next.tasks, next.client);
  if (!next.client) next.questions.push({ kind: "matter", typed: next.typedMatter, options: [] });
  if (next.client && next.hours !== null) {
    const inc = ctx.clients.find((c) => c.name === next.client)?.increment ?? 0.1;
    if (!isCleanMultiple(next.hours, inc)) {
      const lo = round2(Math.floor(next.hours / inc + EPS) * inc);
      const hi = round2(Math.ceil(next.hours / inc - EPS) * inc);
      next.questions.push({ kind: "increment", total: next.hours, increment: inc, options: [...new Set([lo, hi])].filter((x) => x > 0) });
    }
  }
  if (next.hours === null || next.hours <= 0) next.questions.push({ kind: "missing-time", task: next.description });
  return next;
}

/** One line for Andy describing a question. */
export function questionText(q: Question): string {
  switch (q.kind) {
    case "matter":
      return q.typed
        ? q.options.length
          ? `Which matter is "${q.typed}"?`
          : `"${q.typed}" doesn't match a client. Which matter?`
        : "No matter given. Which one?";
    case "bare-integer":
      return `"(${q.value})": ${q.value}.0 hours, or .${q.value}?`;
    case "increment":
      return `${formatHours(q.total)} isn't a clean ${q.increment === 0.25 ? "quarter-hour" : "tenth"} for this matter.`;
    case "total-mismatch":
      return `Tasks add to ${formatHours(q.sum)}, but the total says ${formatHours(q.given)}.`;
    case "missing-time":
      return `No time on "${q.task}".`;
    case "date":
      return `Check the date "${q.text}".`;
  }
}
