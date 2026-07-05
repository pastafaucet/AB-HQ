import "server-only";
import { getSupabase } from "@/lib/supabase";
import type { Task, Matter, Domain, TaskType, TaskStatus } from "@/lib/data";

// --- DB row shapes (snake_case) ---
interface TaskRowDB {
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

interface MatterRowDB {
  id: string;
  name: string;
  client: string | null;
  status: string | null;
  next_deadline: string | null;
}

function todayISO(): string {
  // Local calendar date as YYYY-MM-DD.
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function dueTagFor(row: TaskRowDB, today: string): string | undefined {
  if (!row.deadline) return undefined;
  if (row.deadline === today) return "DUE TODAY";
  const [, mm, dd] = row.deadline.split("-");
  const mi = Number(mm) - 1;
  if (mi < 0 || mi > 11) return undefined;
  return `${MONTHS[mi]} ${Number(dd)}`;
}

function toTask(row: TaskRowDB, today: string): Task {
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
    dueTag: dueTagFor(row, today),
  };
}

function toMatter(row: MatterRowDB, today: string): Matter {
  let next: string | undefined;
  let nextColor: string | undefined;
  if (row.next_deadline) {
    if (row.next_deadline === today) {
      next = "next deadline · today";
      nextColor = "var(--orange)";
    } else {
      const [, mm, dd] = row.next_deadline.split("-");
      next = `next · ${MONTHS[Number(mm) - 1]} ${Number(dd)}`;
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

export interface MyDayData {
  mits: Task[];
  alsoToday: Task[];
  inProgress: Task[];
  matters: Matter[];
}

/** All data the My Day (Today) surface needs, for the current calendar day. */
export async function getMyDayData(): Promise<MyDayData> {
  const sb = getSupabase();
  const today = todayISO();

  const [tasksRes, mattersRes] = await Promise.all([
    sb
      .from("tasks")
      .select(
        "id,title,status,domain,type,important,urgent,mit,do_date,deadline,matter_id,completed_at"
      )
      .neq("status", "Cancelled")
      .order("created_at", { ascending: true }),
    sb.from("matters").select("id,name,client,status,next_deadline"),
  ]);

  if (tasksRes.error) throw tasksRes.error;
  if (mattersRes.error) throw mattersRes.error;

  const tasks = (tasksRes.data as TaskRowDB[]).map((r) => toTask(r, today));
  const matters = (mattersRes.data as MatterRowDB[]).map((r) => toMatter(r, today));

  const mits = tasks.filter((t) => t.mit);
  const alsoToday = tasks.filter(
    (t) => !t.mit && t.doDate === today && t.status !== "In Progress"
  );
  const inProgress = tasks.filter((t) => !t.mit && t.status === "In Progress");

  return { mits, alsoToday, inProgress, matters };
}
