"use server";

import { hoursSheetId, getRange } from "@/lib/google-sheets";
import { LIVE_SHEET_ID, serialOf, undoEntry, writeEntry } from "@/lib/hours-sheet";
import { todayISO } from "@/lib/task-map";

// End-to-end check of the hours-sheet writer against the TEST copy only:
// one APPEND, one MERGE, one INSERT into an earlier day, then an Undo of
// each (newest first). Refuses to run against the live sheet.

export interface SelfTestStep {
  step: string;
  ok: boolean;
  detail: string;
}

const TAB = "'Andy''s Hours'";

export async function runHoursSelfTest(): Promise<SelfTestStep[]> {
  const out: SelfTestStep[] = [];
  const push = (step: string, ok: boolean, detail: string) => out.push({ step, ok, detail });
  if (hoursSheetId() === LIVE_SHEET_ID) {
    push("guard", false, "HOURS_SHEET_ID is the live sheet. The self-test only runs against the test copy.");
    return out;
  }
  const today = todayISO();
  const stamp = new Date().toISOString().slice(11, 19);
  const logIds: { label: string; id: string | null }[] = [];

  try {
    // 1. APPEND: today, a client unlikely to have a row today.
    const a = await writeEntry(
      { date: today, client: "GW/Administration", hours: 0.25, description: `ZZ AB HQ self-test append ${stamp}` },
      "selftest append"
    );
    push("APPEND", a.ok && a.action === "APPEND", `${a.action} row ${a.row} · ${a.message}${a.flag ? ` · flag: ${a.flag}` : ""}`);
    logIds.push({ label: "append", id: a.logId });

    // 2. MERGE: same client, same day.
    const m = await writeEntry(
      { date: today, client: "GW/Administration", hours: 0.25, description: `ZZ AB HQ self-test merge ${stamp}` },
      "selftest merge"
    );
    push("MERGE", m.ok && m.action === "MERGE", `${m.action} row ${m.row} · ${m.message}${m.flag ? ` · flag: ${m.flag}` : ""}`);
    logIds.push({ label: "merge", id: m.logId });

    // 3. INSERT: the latest earlier day this month that already has rows.
    const [i3] = await getRange(`${TAB}!I3`, "UNFORMATTED_VALUE");
    const last = Number(i3?.[0]) || 5;
    const rows = await getRange(`${TAB}!B5:C${last}`, "UNFORMATTED_VALUE");
    const monthStart = serialOf(`${today.slice(0, 7)}-01`);
    const todaySerial = serialOf(today);
    const days = [...new Set(rows.map((r) => Number(r[0])).filter((s) => s >= monthStart && s < todaySerial))].sort((x, y) => y - x);
    if (!days.length) {
      push("INSERT", false, "No earlier day this month has rows in the test copy, so there's nowhere to insert before.");
    } else {
      const serial = days[0];
      const iso = new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
      const ins = await writeEntry(
        { date: iso, client: "GW/Recruiting", hours: 0.25, description: `ZZ AB HQ self-test insert ${stamp}` },
        "selftest insert"
      );
      push("INSERT", ins.ok && ins.action === "INSERT", `${ins.action} row ${ins.row} (${iso}) · ${ins.message}${ins.flag ? ` · flag: ${ins.flag}` : ""}`);
      logIds.push({ label: "insert", id: ins.logId });
    }

    // 4. Undo each, newest first.
    for (const l of [...logIds].reverse()) {
      if (!l.id) {
        push(`UNDO ${l.label}`, false, "No log id (is migration 0017 applied?).");
        continue;
      }
      const u = await undoEntry(l.id);
      push(`UNDO ${l.label}`, u.ok, u.message);
    }
  } catch (e) {
    push("error", false, e instanceof Error ? e.message : String(e));
  }
  return out;
}
