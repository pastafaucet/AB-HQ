"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { todayISO } from "@/lib/task-map";
import { sheetsConfigured } from "@/lib/google-sheets";
import {
  addClient,
  editEntry,
  getHoursToday,
  loadAliases,
  loadClients,
  saveAlias,
  undoEntry,
  writeEntry,
  type HoursToday,
} from "@/lib/hours-sheet";
import {
  applyAnswers,
  parseTimeCapture,
  questionText,
  type ParseContext,
  type ParsedEntry,
} from "@/lib/time-entry";

// Time entry from Capture → the hours Google Sheet. Clear entries are written
// immediately; anything uncertain comes back as a card for Andy to confirm.

export interface LoggedItem {
  logId: string | null;
  message: string;
  flag: string | null;
  notes: string[]; // closed month, already entered, type problem
}

export interface PendingItem {
  entry: ParsedEntry;
  questions: string[];
}

export interface TimeCaptureResult {
  logged: LoggedItem[];
  pending: PendingItem[];
  errors: string[];
  clientNames: string[]; // for the confirm card's matter picker
}

async function context(): Promise<ParseContext> {
  const [clients, aliases] = await Promise.all([loadClients(), loadAliases()]);
  return { today: todayISO(), clients, aliases };
}

function notesFor(r: Awaited<ReturnType<typeof writeEntry>>): string[] {
  const n: string[] = [];
  if (r.closedMonth && r.ok)
    n.push("That month's heading totals are fixed text and won't reflect it; the top strip and Summary tab do.");
  if (r.entered) n.push("A matching row was already entered in the firm system, so this went on its own row.");
  if (r.typeProblem) n.push("Column G didn't recognize the client name. Check the Clients tab.");
  return n;
}

async function write(e: ParsedEntry, raw: string): Promise<LoggedItem> {
  const r = await writeEntry(
    { date: e.date, client: e.client!, hours: e.hours!, description: e.description },
    raw,
    e
  );
  return { logId: r.logId, message: r.message, flag: r.flag, notes: notesFor(r) };
}

/** Keep the raw capture in AB HQ's ledger too (never lost), marked as a time entry. */
async function keepRaw(raw: string, summary: string) {
  const sb = getSupabase();
  const row = { raw, kind: "log", status: "filed", summary, routed_by: "hours" };
  const { error } = await sb.from("entries").insert(row);
  if (error) await sb.from("entries").insert({ ...row, routed_by: "manual" }); // before migration 0017
}

/** Called by captureEntry when the text holds a time in parentheses. */
export async function captureTime(raw: string): Promise<TimeCaptureResult> {
  const out: TimeCaptureResult = { logged: [], pending: [], errors: [], clientNames: [] };
  if (!sheetsConfigured()) {
    out.errors.push("The hours sheet isn't connected yet (Google env vars missing).");
    return out;
  }
  let ctx: ParseContext;
  try {
    ctx = await context();
  } catch (e) {
    out.errors.push(e instanceof Error ? e.message : "Couldn't read the Clients tab.");
    return out;
  }
  out.clientNames = ctx.clients.filter((c) => c.active).map((c) => c.name).sort();
  const entries = parseTimeCapture(raw, ctx);
  // One entry at a time, each fully finished before the next.
  for (const e of entries) {
    if (e.questions.length) {
      out.pending.push({ entry: e, questions: e.questions.map(questionText) });
      continue;
    }
    try {
      out.logged.push(await write(e, e.line));
    } catch (err) {
      out.errors.push(`${e.line}: ${err instanceof Error ? err.message : "write failed"}`);
    }
  }
  await keepRaw(raw, out.logged.map((l) => l.message).join(" / ") || "Time entry (awaiting confirmation)");
  revalidatePath("/work/time");
  return out;
}

/** Andy's answers on a card: re-check, then write if nothing's left to ask. */
export async function confirmTimeEntry(
  entry: ParsedEntry,
  answers: { client?: string; date?: string; hours?: number; bareIntegers?: number[]; description?: string; saveAliasAs?: string }
): Promise<{ logged?: LoggedItem; pending?: PendingItem; error?: string }> {
  try {
    const ctx = await context();
    if (answers.client && !ctx.clients.some((c) => c.name === answers.client))
      return { error: `"${answers.client}" isn't on the Clients tab. Add it as a new client first.` };
    const next = applyAnswers(entry, answers, ctx);
    if (next.questions.length) return { pending: { entry: next, questions: next.questions.map(questionText) } };
    if (answers.saveAliasAs && answers.client) await saveAlias(answers.saveAliasAs, answers.client);
    const logged = await write(next, entry.line);
    revalidatePath("/work/time");
    return { logged };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't write." };
  }
}

export async function undoTimeEntry(logId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await undoEntry(logId);
    revalidatePath("/work/time");
    return r;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Undo failed." };
  }
}

export async function editTimeEntry(
  key: { date: string; client: string; description: string },
  patch: { hours?: number; description?: string }
): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await editEntry(key, patch);
    revalidatePath("/work/time");
    return r;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Edit failed." };
  }
}

export async function addHoursClient(
  name: string,
  billable: boolean,
  increment: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    await addClient(name, billable, increment);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't add the client." };
  }
}

export async function loadHoursToday(date?: string): Promise<{ data?: HoursToday; error?: string }> {
  if (!sheetsConfigured()) return { error: "The hours sheet isn't connected yet." };
  try {
    return { data: await getHoursToday(date ?? todayISO()) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't read the hours sheet." };
  }
}
