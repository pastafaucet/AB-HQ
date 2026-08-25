import type {
  Task,
  Matter,
  Project,
  ProjectStatus,
  Domain,
  TaskType,
  TaskStatus,
  Priority,
} from "@/lib/data";

// Shared DB-row → app-object mapping (used by queries and task actions).

export const TASK_COLUMNS =
  "id,title,status,domain,type,priority,mit,do_date,do_time,duration_min,matter_id,project_id,notes,completed_at";

export interface TaskRowDB {
  id: string;
  title: string;
  status: TaskStatus;
  domain: Domain;
  type: TaskType;
  priority: number;
  mit: boolean;
  do_date: string | null;
  do_time: string | null;
  duration_min: number | null;
  matter_id: string | null;
  project_id: string | null;
  notes: string | null;
  completed_at: string | null;
}

export const PROJECT_COLUMNS = "id,name,matter_id,deadline,status,notes";

export interface ProjectRowDB {
  id: string;
  name: string;
  matter_id: string | null;
  deadline: string | null;
  status: ProjectStatus;
  notes: string | null;
}

export function rowToProject(row: ProjectRowDB): Project {
  return {
    id: row.id,
    name: row.name,
    matterId: row.matter_id ?? undefined,
    deadline: row.deadline ?? undefined,
    status: row.status,
    notes: row.notes ?? undefined,
  };
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

/** "09:30" → "9:30A" */
export function formatTime(hhmm: string | null | undefined): string | undefined {
  if (!hhmm) return undefined;
  const [hStr, mStr] = hhmm.split(":");
  let h = Number(hStr);
  const m = mStr ?? "00";
  const ap = h >= 12 ? "P" : "A";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m}${ap}`;
}

/** Display tag for a task row: the time if set, else a future date. */
export function dueTagFor(
  doDate: string | null,
  doTime: string | null,
  today: string
): string | undefined {
  if (doTime) return formatTime(doTime);
  if (doDate && doDate !== today) {
    const parts = doDate.split("-");
    const mi = Number(parts[1]) - 1;
    if (mi >= 0 && mi <= 11) return `${MONTHS[mi]} ${Number(parts[2])}`;
  }
  return undefined;
}

export function rowToTask(row: TaskRowDB, today: string): Task {
  const p = (row.priority >= 1 && row.priority <= 4 ? row.priority : 3) as Priority;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    domain: row.domain,
    type: row.type,
    priority: p,
    mit: row.mit,
    doDate: row.do_date ?? undefined,
    doTime: row.do_time ? row.do_time.slice(0, 5) : undefined,
    durationMin: row.duration_min ?? undefined,
    matterId: row.matter_id ?? undefined,
    projectId: row.project_id ?? undefined,
    notes: row.notes ?? undefined,
    dueTag: dueTagFor(row.do_date, row.do_time ? row.do_time.slice(0, 5) : null, today),
    completedAt: row.completed_at ?? undefined,
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
