import type { Task, Matter, Domain, TaskType, TaskStatus } from "@/lib/data";

// Shared DB-row → app-object mapping (used by queries and task actions).

export const TASK_COLUMNS =
  "id,title,status,domain,type,important,urgent,mit,do_date,deadline,matter_id,completed_at";

export interface TaskRowDB {
  id: string;
  title: string;
  status: TaskStatus;
  domain: Domain;
  type: TaskType;
  important: boolean;
  urgent: boolean;
  mit: boolean;
  do_date: string | null;
  deadline: string | null;
  matter_id: string | null;
  completed_at: string | null;
}

export interface MatterRowDB {
  id: string;
  name: string;
  client: string | null;
  status: string | null;
  next_deadline: string | null;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dueTagFor(deadline: string | null, today: string): string | undefined {
  if (!deadline) return undefined;
  if (deadline === today) return "DUE TODAY";
  const parts = deadline.split("-");
  const mi = Number(parts[1]) - 1;
  if (mi < 0 || mi > 11) return undefined;
  return `${MONTHS[mi]} ${Number(parts[2])}`;
}

export function rowToTask(row: TaskRowDB, today: string): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    domain: row.domain,
    type: row.type,
    important: row.important,
    urgent: row.urgent,
    mit: row.mit,
    doDate: row.do_date ?? undefined,
    deadline: row.deadline ?? undefined,
    matterId: row.matter_id ?? undefined,
    dueTag: dueTagFor(row.deadline, today),
  };
}

export function rowToMatter(row: MatterRowDB, today: string): Matter {
  let next: string | undefined;
  let nextColor: string | undefined;
  if (row.next_deadline) {
    if (row.next_deadline === today) {
      next = "next deadline · today";
      nextColor = "var(--orange)";
    } else {
      const parts = row.next_deadline.split("-");
      next = `next · ${MONTHS[Number(parts[1]) - 1]} ${Number(parts[2])}`;
      nextColor = "var(--muted)";
    }
  }
  return {
    id: row.id,
    name: row.name,
    client: row.client ?? "",
    stage: row.status ?? "",
    status: row.status ?? "",
    next,
    nextColor,
  };
}
