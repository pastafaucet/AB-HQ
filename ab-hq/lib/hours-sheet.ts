import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabase } from "@/lib/supabase";
import { batchUpdate, getRange, getRanges, hoursSheetId, setRange, type Cell } from "@/lib/google-sheets";
import {
  formatHours,
  parseAliasCell,
  shortDate,
  toSheetDate,
  type AliasRow,
  type ClientRow,
} from "@/lib/time-entry";

// Writes time entries to the "2021 AB Daily Hours" sheet, following Andy's
// procedure exactly (Nov 2026 spec). The sheet decides placement through its
// helper cells; this code never picks a row itself, never appends, never
// deletes, and only ever writes B, C, D, F (plus I1 and I4 as inputs).

export const LIVE_SHEET_ID = "1bYUEgVJfO6nzMYEmvrGG-xXmGk4TO0WCy14EM6bm_u4";
const TAB = "'Andy''s Hours'";
const SHEET_GID = 1100000001;

/** Seed aliases, used if migration 0017 (the alias table) isn't applied yet. */
const SEED_ALIASES: AliasRow[] = [
  { typed: "AB 218", canonical: "COLA/Does" },
  { typed: "GW Fire", canonical: "Fire cases" },
  { typed: "GW - Fire", canonical: "Fire cases" },
  { typed: "Morales", canonical: "COLA/Fight Club 2" },
  { typed: "LOJHK", canonical: "COLA/Fight Club 3" },
  { typed: "Tia", canonical: "Cedars/Tia" },
  { typed: "Cedars Huntington", canonical: "Cedars/Huntington" },
  { typed: "RS Gen", canonical: "RS/General" },
  { typed: "Biz dev", canonical: "GW/Business Dev." },
  { typed: "GW Admin", canonical: "GW/Administration" },
];

// ---------------------------------------------------------------- reference data

export async function loadClients(): Promise<ClientRow[]> {
  const rows = await getRange("Clients!A2:E300");
  return rows
    .filter((r) => typeof r[0] === "string" && (r[0] as string).trim())
    .map((r) => ({
      name: String(r[0]).trim(),
      billable: String(r[1] ?? "").trim() !== "Non-billable",
      increment: Number(r[2]) || 0.1,
      aliases: r[3] ? parseAliasCell(String(r[3])) : [],
      active: String(r[4] ?? "").trim() !== "Inactive",
    }));
}

export async function loadAliases(): Promise<AliasRow[]> {
  const { data, error } = await getSupabase().from("time_entry_aliases").select("typed,canonical");
  if (error) return SEED_ALIASES;
  return data as AliasRow[];
}

export async function saveAlias(typed: string, canonical: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase().from("time_entry_aliases").insert({ typed: typed.trim(), canonical });
  if (error && !/duplicate/i.test(error.message)) return { ok: false, error: error.message };
  return { ok: true };
}

/** Add a new client row to the Clients tab (A name, B type, C increment, E Active; never D). */
export async function addClient(name: string, billable: boolean, increment: number): Promise<void> {
  const col = await getRange("Clients!A2:A300");
  let row = 2;
  for (let i = 0; i < 299; i++) {
    const v = col[i]?.[0];
    if (v === undefined || v === null || String(v).trim() === "") {
      row = i + 2;
      break;
    }
  }
  const check = await getRange(`Clients!A${row}:E${row}`);
  if (check[0]?.some((v) => v !== null && String(v).trim() !== "")) throw new Error("Clients tab changed underneath; try again.");
  await setRange(`Clients!A${row}:C${row}`, [[name.trim(), billable ? "Billable" : "Non-billable", increment]]);
  await setRange(`Clients!E${row}`, [["Active"]]);
}

// ---------------------------------------------------------------- helpers

/** Google Sheets date serial for YYYY-MM-DD. */
export function serialOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

const blank = (v: Cell | undefined) => v === undefined || v === null || String(v).trim() === "";
const num = (v: Cell | undefined) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, "")) || 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const hasTime = (s: string) => /\((\d*\.\d+)\)/.test(s);
// Sheets compares text case-insensitively (its own MERGE test does); match that.
const same = (a: Cell | undefined, b: string) => String(a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

/** One-row lock in Supabase so two captures never share the helper cells. */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const sb = getSupabase();
  const holder = randomUUID();
  let got = false;
  for (let i = 0; i < 60 && !got; i++) {
    const now = new Date();
    const { data, error } = await sb
      .from("time_entry_lock")
      .update({ locked_until: new Date(now.getTime() + 60_000).toISOString(), holder })
      .eq("id", 1)
      .lt("locked_until", now.toISOString())
      .select("id");
    if (error) throw new Error("Time entry isn't set up yet: run migration 0017 in Supabase.");
    if (data && data.length) got = true;
    else await new Promise((r) => setTimeout(r, 250));
  }
  if (!got) throw new Error("Another time entry is still being written. Try again in a moment.");
  try {
    return await fn();
  } finally {
    await sb.from("time_entry_lock").update({ locked_until: "1970-01-01T00:00:00Z", holder: null }).eq("id", 1).eq("holder", holder);
  }
}

async function log(row: Record<string, unknown>): Promise<string | null> {
  const { data } = await getSupabase()
    .from("time_entry_log")
    .insert({ ...row, sheet_id: hoursSheetId() })
    .select("id")
    .single();
  return (data as { id: string } | null)?.id ?? null;
}

/** Row of the open-months label: rows above it are closed months. */
async function openLabelRow(): Promise<number> {
  const marks = await getRange(`${TAB}!I5:I`);
  let last = 0;
  marks.forEach((r, i) => {
    if (r[0] === "M") last = i + 5;
  });
  return last;
}

// ---------------------------------------------------------------- write

export interface WriteInput {
  date: string; // YYYY-MM-DD
  client: string;
  hours: number;
  description: string; // F as it should read for a new row
}

export interface WriteResult {
  ok: boolean;
  logId: string | null;
  action: "MERGE" | "APPEND" | "INSERT" | "ASK";
  row: number | null;
  message: string; // the one line shown to Andy
  flag: string | null; // column H, word for word
  typeProblem: boolean; // G shows "?"
  closedMonth: boolean;
  entered: boolean; // matching row was already entered in the firm system
}

/** The one place descriptions get their times when rows merge. */
function mergeDescription(oldF: string, oldD: number, add: WriteInput): string {
  const rs = add.client === "RS/General";
  const strip = (s: string) => s.replace(/\s*\((\d*\.\d+)\)/g, "").trim();
  if (rs) return [strip(oldF), strip(add.description)].filter(Boolean).join("; ");
  const prior = oldF.trim() ? (hasTime(oldF) ? oldF.trim() : `${oldF.trim()} (${formatHours(oldD)})`) : "";
  const fresh = hasTime(add.description) ? add.description.trim() : `${add.description.trim()} (${formatHours(add.hours)})`;
  return [prior, fresh].filter(Boolean).join("; ");
}

/** Steps 1-5 of the write procedure for one entry, under the lock. */
export async function writeEntry(input: WriteInput, raw: string, parsed?: unknown): Promise<WriteResult> {
  return withLock(async () => {
    const serial = serialOf(input.date);
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        // Step 1: inputs to the helper, then ask it where the entry goes.
        await setRange(`${TAB}!I1:I4`, [[toSheetDate(input.date)], [null], [null], [input.client]]);
        const [i2] = await getRanges([`${TAB}!I2`]);
        const [action, rowStr, inherit, note] = String(i2[0]?.[0] ?? "").split("|");
        const entered = note === "ENTERED";

        if (action === "ASK") {
          await log({ raw, parsed, action: "ASK", status: "failed" });
          return {
            ok: false, logId: null, action: "ASK", row: null, flag: null, typeProblem: false, closedMonth: true, entered,
            message: `${shortDate(input.date)} is in a closed month with no entries that day, so the sheet won't place it. Nothing was written.`,
          };
        }

        const row = Number(rowStr);
        if (!row || !["MERGE", "APPEND", "INSERT"].includes(action)) throw new Error(`The sheet's placement cell said "${i2[0]?.[0] ?? ""}".`);
        let undo: Record<string, unknown>;

        if (action === "MERGE") {
          // Step 2: confirm the row is still the one, then add to it.
          const [cur] = await getRanges([`${TAB}!A${row}:F${row}`], "UNFORMATTED_VALUE");
          const r = cur[0] ?? [];
          if (num(r[1]) !== serial || !same(r[2], input.client) || r[0] === true) continue;
          const oldD = num(r[3]);
          const oldF = String(r[5] ?? "");
          const newD = round2(oldD + input.hours);
          const newF = mergeDescription(oldF, oldD, input);
          await setRange(`${TAB}!D${row}:F${row}`, [[newD, null, newF]]);
          undo = { kind: "merge", date: input.date, client: input.client, prevD: oldD, prevF: oldF, curD: newD, curF: newF };
        } else {
          // Step 3: a new row, placed where the sheet says.
          if (action === "INSERT") {
            await batchUpdate([
              {
                insertDimension: {
                  range: { sheetId: SHEET_GID, dimension: "ROWS", startIndex: row - 1, endIndex: row },
                  inheritFromBefore: inherit === "BEFORE",
                },
              },
            ]);
          }
          const [cur] = await getRanges([`${TAB}!B${row}:F${row}`], "UNFORMATTED_VALUE");
          const r = cur[0] ?? [];
          if (![r[0], r[1], r[2], r[4]].every(blank)) continue;
          await setRange(`${TAB}!B${row}:F${row}`, [[toSheetDate(input.date), input.client, input.hours, null, input.description]]);
          undo = { kind: "new", date: input.date, client: input.client, curD: input.hours, curF: input.description };
        }

        // Step 4: read back.
        const [back, top] = await getRanges([`${TAB}!B${row}:H${row}`, `${TAB}!B3`]);
        const b = back[0] ?? [];
        const g = String(b[5] ?? "");
        const h = String(b[6] ?? "").trim();
        const typeProblem = g !== "Billable" && g !== "Non-billable";
        const closedMonth = row < (await openLabelRow());
        const today = String(top[0]?.[0] ?? "");
        const logId = await log({
          raw, parsed, action, row_written: row, status: "ok", undo,
          readback: { B: b[0], C: b[1], D: b[2], F: b[4], G: g, H: h },
        });
        const desc = action === "MERGE" ? String(undo.curF) : input.description;
        return {
          ok: true, logId, action: action as WriteResult["action"], row, flag: h || null, typeProblem, closedMonth, entered,
          message: `Logged ${shortDate(input.date)} | ${input.client} | ${formatHours(input.hours)} | ${desc}. Today: ${today} billable.`,
        };
      }
      throw new Error("The sheet kept changing underneath (three tries). Nothing was written; try again.");
    } finally {
      // Step 5: clear the inputs.
      await setRange(`${TAB}!I1:I4`, [[""], [null], [null], [""]]).catch(() => {});
    }
  });
}

// ---------------------------------------------------------------- find, undo, edit

/** Find a row again by date + client + description (row numbers shift; never trust a stored one). */
async function findRow(date: string, client: string, description: string): Promise<{ row: number; entered: boolean; d: number; f: string } | null> {
  const [i3] = await getRanges([`${TAB}!I3`], "UNFORMATTED_VALUE");
  const last = Math.max(5, num(i3[0]?.[0]));
  const rows = await getRange(`${TAB}!A5:F${last}`, "UNFORMATTED_VALUE");
  const serial = serialOf(date);
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (num(r[1]) === serial && same(r[2], client) && String(r[5] ?? "").trim() === description.trim())
      return { row: i + 5, entered: r[0] === true, d: num(r[3]), f: String(r[5] ?? "") };
  }
  return null;
}

export async function undoEntry(logId: string): Promise<{ ok: boolean; message: string }> {
  const { data } = await getSupabase().from("time_entry_log").select("id,raw,undo,status").eq("id", logId).maybeSingle();
  const entry = data as { raw: string; undo: Record<string, unknown> | null; status: string } | null;
  if (!entry?.undo) return { ok: false, message: "Nothing to undo for that entry." };
  if (entry.status === "undone") return { ok: false, message: "Already undone." };
  const u = entry.undo as { kind: "new" | "merge"; date: string; client: string; prevD?: number; prevF?: string; curD: number; curF: string };
  return withLock(async () => {
    const hit = await findRow(u.date, u.client, u.curF);
    if (!hit) return { ok: false, message: "Couldn't find that row any more (it may have been edited). Nothing changed." };
    if (u.kind === "new") await setRange(`${TAB}!B${hit.row}:F${hit.row}`, [["", "", "", null, ""]]);
    else await setRange(`${TAB}!D${hit.row}:F${hit.row}`, [[u.prevD ?? "", null, u.prevF ?? ""]]);
    await getSupabase().from("time_entry_log").update({ status: "undone" }).eq("id", logId);
    await log({ raw: `UNDO ${entry.raw}`, action: "UNDO", row_written: hit.row, status: "ok", parsed: { of: logId } });
    const warn = hit.entered ? " That row was already ticked Entered: Lara needs to fix the firm system too." : "";
    return { ok: true, message: `Undone: ${shortDate(u.date)} | ${u.client}.${warn}` };
  });
}

/** Change hours (D) or description (F) of a row in place, found by date + client + description. */
export async function editEntry(
  key: { date: string; client: string; description: string },
  patch: { hours?: number; description?: string }
): Promise<{ ok: boolean; message: string }> {
  return withLock(async () => {
    const hit = await findRow(key.date, key.client, key.description);
    if (!hit) return { ok: false, message: "Couldn't find that row (it may have changed). Nothing changed." };
    const d = patch.hours ?? hit.d;
    const f = patch.description ?? hit.f;
    await setRange(`${TAB}!D${hit.row}:F${hit.row}`, [[d, null, f]]);
    // Keep any log's Undo pointing at the row's current text.
    const { data } = await getSupabase()
      .from("time_entry_log")
      .select("id,undo")
      .eq("status", "ok")
      .order("created_at", { ascending: false })
      .limit(50);
    for (const l of (data ?? []) as { id: string; undo: Record<string, unknown> | null }[]) {
      const u = l.undo as { date?: string; client?: string; curF?: string } | null;
      if (u && u.date === key.date && u.client === key.client && u.curF === key.description) {
        await getSupabase().from("time_entry_log").update({ undo: { ...u, curD: d, curF: f } }).eq("id", l.id);
      }
    }
    await log({ raw: `EDIT ${key.client} ${key.date}`, action: "EDIT", row_written: hit.row, status: "ok", parsed: { key, patch } });
    const warn = hit.entered ? " This row was already ticked Entered: Lara needs to correct the firm system too." : "";
    return { ok: true, message: `Updated ${shortDate(key.date)} | ${key.client}.${warn}` };
  });
}

// ---------------------------------------------------------------- today

export interface HoursToday {
  today: string; // B3
  month: string; // C3
  pace: string; // F3
  rows: { date: string; client: string; hours: number; description: string; type: string; flag: string; entered: boolean }[];
}

export async function getHoursToday(date: string): Promise<HoursToday> {
  const [top, i3] = await getRanges([`${TAB}!B3:F3`, `${TAB}!I3`], "FORMATTED_VALUE");
  const last = Math.max(5, num(i3[0]?.[0]));
  const rows = await getRange(`${TAB}!A5:H${last}`, "UNFORMATTED_VALUE");
  const serial = serialOf(date);
  return {
    today: String(top[0]?.[0] ?? ""),
    month: String(top[0]?.[1] ?? ""),
    pace: String(top[0]?.[4] ?? ""),
    rows: rows
      .filter((r) => num(r[1]) === serial && !blank(r[2]))
      .map((r) => ({
        date,
        client: String(r[2]),
        hours: num(r[3]),
        description: String(r[5] ?? ""),
        type: String(r[6] ?? ""),
        flag: String(r[7] ?? "").trim(),
        entered: r[0] === true,
      })),
  };
}
