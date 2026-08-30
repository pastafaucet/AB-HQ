import type { Entry, EntryKind } from "@/lib/data";

// Shared DB-row → app-object mapping for the capture ledger.

export const ENTRY_COLUMNS =
  "id,raw,kind,status,matter_id,project_id,task_id,summary,billed_tenths,routed_by,created_at";

// Pre-migration-0013 column set.
export const ENTRY_COLUMNS_LEGACY = ENTRY_COLUMNS.replace(",billed_tenths", "");

export interface EntryRowDB {
  id: string;
  raw: string;
  kind: EntryKind;
  status: Entry["status"];
  matter_id: string | null;
  project_id: string | null;
  task_id: string | null;
  summary: string | null;
  billed_tenths?: number | null;
  routed_by: "ai" | "manual" | null;
  created_at: string;
}

export function rowToEntry(row: EntryRowDB): Entry {
  return {
    id: row.id,
    raw: row.raw,
    kind: row.kind,
    status: row.status,
    matterId: row.matter_id ?? undefined,
    projectId: row.project_id ?? undefined,
    taskId: row.task_id ?? undefined,
    summary: row.summary ?? undefined,
    billedTenths: row.billed_tenths ?? undefined,
    routedBy: row.routed_by ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Split a pasted billing-style line into activities and pull the tenths.
 * "review redlines (.4); emails with CoCo re same (.2)" → two segments.
 * Activities are anchored on the "(.N)" time markers, so the separators
 * between them (";", ":", ".") are forgiven. A single capture without a
 * time passes through untouched.
 */
export function splitBillingLine(raw: string): { text: string; tenths: number | null }[] {
  const trimmed = raw.trim();
  const toTenths = (s: string): number | null => {
    // "(25 mins)" / "(30 min)" → tenths, rounded UP (billing convention: 25m → .5)
    const mins = s.match(/^(\d+)\s*min(?:ute)?s?$/i);
    if (mins) {
      const t = Math.max(1, Math.ceil(parseInt(mins[1], 10) / 6));
      return t <= 240 ? t : null;
    }
    // "(.4)" / "(1.2)" — hours in tenths
    if (!/^\d*\.?\d+$/.test(s)) return null;
    const h = parseFloat(s);
    if (!isFinite(h) || h <= 0) return null;
    const t = Math.round(h * 10);
    return t > 0 && t <= 240 ? t : null;
  };

  // Each match = the text leading up to a short "(…)" marker. Non-time parens
  // ("(the causation expert)") fail toTenths and are folded back into the text.
  // [\s\S] instead of the dotAll flag — the project's TS target predates es2018.
  const re = /([\s\S]+?)\(([^()]{1,12})\)\s*[;:.]?\s*/g;
  const found: { text: string; tenths: number | null }[] = [];
  let buffer = "";
  let lastEnd = 0;
  for (const m of trimmed.matchAll(re)) {
    lastEnd = (m.index ?? 0) + m[0].length;
    const tenths = toTenths(m[2].trim());
    if (tenths === null) {
      buffer += m[0];
      continue;
    }
    const text = (buffer + m[1]).trim().replace(/^[;:.,]\s*/, "").replace(/[;:,]$/, "").trim();
    buffer = "";
    if (text) found.push({ text, tenths });
  }
  const remainder = (buffer + trimmed.slice(lastEnd)).trim().replace(/^[;:.,]\s*/, "");

  if (found.length >= 2) {
    if (remainder) found.push({ text: remainder, tenths: null });
    return found;
  }
  if (found.length === 1 && !remainder) return found;
  return [{ text: trimmed, tenths: null }];
}

/** Strip embedded time markers — "(.4)", "(25 mins)", "(0.4 hours)." — from display text. */
export function stripTimeMarkers(text: string): string {
  return text
    .replace(/\s*\((?:\d*\.?\d+|\d+\s*min(?:ute)?s?|\d*\.?\d+\s*h(?:ou)?rs?)\)\s*\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([;,.])/g, "$1")
    .trim();
}
