"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { todayISO } from "@/lib/task-map";
import { sheetsConfigured } from "@/lib/google-sheets";
import { fixTypos } from "@/lib/typo-fix";
import {
  addClient,
  clearEntry,
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
  isCleanMultiple,
  formatHours,
  descriptionTimes,
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
  pendingId?: string | null; // saved in time_entry_log so it survives closing the Capture box
}

/** Save an unconfirmed entry so it waits on the Time screen until logged or skipped. */
async function savePending(e: ParsedEntry): Promise<string | null> {
  const { data } = await getSupabase()
    .from("time_entry_log")
    .insert({ raw: e.line, parsed: e, action: "ASK", status: "pending" })
    .select("id")
    .single();
  return (data as { id: string } | null)?.id ?? null;
}

async function closePending(id: string | null | undefined, status: "resolved" | "skipped") {
  if (id) await getSupabase().from("time_entry_log").update({ status }).eq("id", id).eq("status", "pending");
}

/** Time entries still waiting for Andy (newest first). */
export async function loadPendingTime(): Promise<PendingItem[]> {
  const { data } = await getSupabase()
    .from("time_entry_log")
    .select("id,parsed")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);
  return ((data ?? []) as { id: string; parsed: ParsedEntry }[])
    .filter((r) => r.parsed && Array.isArray(r.parsed.tasks))
    .map((r) => ({ entry: r.parsed, questions: (r.parsed.questions ?? []).map(questionText), pendingId: r.id }));
}

export async function skipPendingTime(id: string): Promise<{ ok: boolean }> {
  await closePending(id, "skipped");
  revalidatePath("/work/time");
  return { ok: true };
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

/**
 * Write one entry. Obvious typos are corrected first and reported (Andy's rule),
 * unless Andy typed the description himself on the confirm card.
 */
async function write(e: ParsedEntry, raw: string, userEdited = false): Promise<LoggedItem> {
  const typo = userEdited ? { text: e.description, fixes: [] as string[] } : await fixTypos(e.description);
  const r = await writeEntry(
    { date: e.date, client: e.client!, hours: e.hours!, description: typo.text },
    raw,
    { ...e, description: typo.text, typoFixes: typo.fixes }
  );
  const corrected = [...e.fixes, ...typo.fixes];
  const notes = notesFor(r);
  if (corrected.length) notes.unshift(`Corrected: ${corrected.join(", ")}`);
  return { logId: r.logId, message: r.message, flag: r.flag, notes };
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
      out.pending.push({ entry: e, questions: e.questions.map(questionText), pendingId: await savePending(e) });
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
  answers: { client?: string; date?: string; hours?: number; bareIntegers?: number[]; description?: string; saveAliasAs?: string },
  pendingId?: string | null
): Promise<{ logged?: LoggedItem; pending?: PendingItem; error?: string }> {
  try {
    const ctx = await context();
    if (answers.client && !ctx.clients.some((c) => c.name === answers.client))
      return { error: `"${answers.client}" isn't on the Clients tab. Add it as a new client first.` };
    const next = applyAnswers(entry, answers, ctx);
    if (next.questions.length) return { pending: { entry: next, questions: next.questions.map(questionText), pendingId } };
    if (answers.saveAliasAs && answers.client) await saveAlias(answers.saveAliasAs, answers.client);
    const logged = await write(next, entry.line, answers.description !== undefined);
    await closePending(pendingId, "resolved");
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

type RowKey = { date: string; client: string; description: string };

/**
 * Change any part of a logged row. Same date and client: hours and
 * description change in place. A new date or client: log it fresh (the sheet
 * places it, merging if it should), then clear the old row. In that order, so
 * a failure can leave a duplicate but never lose time.
 */
export async function saveTimeEdit(
  key: RowKey,
  next: { date: string; client: string; hours: number; description: string }
): Promise<{ ok: boolean; message: string }> {
  try {
    if (!next.description.trim()) return { ok: false, message: "The description can't be empty." };
    if (!(next.hours > 0)) return { ok: false, message: "Hours must be more than zero." };
    const clients = await loadClients();
    const c = clients.find((x) => x.name === next.client);
    if (!c) return { ok: false, message: `"${next.client}" isn't on the Clients tab.` };
    // Times written in the description must match the hours (the sheet's own check).
    const dt = descriptionTimes(next.description);
    if (dt.bareIntegers.length)
      return { ok: false, message: `Write whole hours with a decimal, e.g. (1.0), so the sheet counts them: ${dt.bareIntegers.join(", ")}.` };
    if (dt.count > 0 && Math.abs(dt.sum - next.hours) > 0.001)
      return { ok: false, message: `The times in the description add to ${formatHours(dt.sum)}, but hours say ${formatHours(next.hours)}.` };
    if (!isCleanMultiple(next.hours, c.increment))
      return {
        ok: false,
        message: `${formatHours(next.hours)} isn't a clean ${c.increment === 0.25 ? "quarter-hour" : "tenth"} for ${c.name}.`,
      };
    if (next.date === key.date && next.client === key.client) {
      const r = await editEntry(key, { hours: next.hours, description: next.description.trim() });
      revalidatePath("/work/time");
      return r;
    }
    const w = await writeEntry(
      { date: next.date, client: next.client, hours: next.hours, description: next.description.trim() },
      `MOVE from ${key.client} ${key.date}`,
      { from: key, to: next }
    );
    if (!w.ok) return { ok: false, message: w.message };
    const cleared = await clearEntry(key);
    revalidatePath("/work/time");
    if (!cleared.ok)
      return { ok: false, message: `${w.message} But the old row couldn't be cleared, so it may now appear twice. Check the sheet.` };
    const notes = [cleared.entered ? "The old row was already ticked Entered: Lara needs to fix the firm system too." : "", ...notesFor(w)].filter(Boolean);
    return { ok: true, message: [w.message, ...notes].join(" ") };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't save the change." };
  }
}

export async function deleteTimeEntry(key: RowKey): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await clearEntry(key);
    revalidatePath("/work/time");
    return { ok: r.ok, message: r.message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't remove it." };
  }
}
