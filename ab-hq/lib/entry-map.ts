import type { Entry, EntryKind } from "@/lib/data";

// Shared DB-row → app-object mapping for the capture ledger.

export const ENTRY_COLUMNS =
  "id,raw,kind,status,matter_id,project_id,task_id,summary,routed_by,created_at";

export interface EntryRowDB {
  id: string;
  raw: string;
  kind: EntryKind;
  status: Entry["status"];
  matter_id: string | null;
  project_id: string | null;
  task_id: string | null;
  summary: string | null;
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
    routedBy: row.routed_by ?? undefined,
    createdAt: row.created_at,
  };
}
