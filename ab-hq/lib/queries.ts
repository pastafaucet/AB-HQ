import "server-only";
import { getSupabase } from "@/lib/supabase";
import type { Task, Matter, RunningTimer } from "@/lib/data";
import {
  TASK_COLUMNS,
  todayISO,
  rowToTask,
  rowToMatter,
  type TaskRowDB,
  type MatterRowDB,
} from "@/lib/task-map";

export interface MyDayData {
  tasks: Task[]; // all tasks relevant to today (mits ∪ also-today ∪ in-progress)
  matters: Matter[];
  today: string;
  running: RunningTimer | null;
  logged: Record<string, number>; // taskId → completed seconds tracked
}

export interface CaseRow {
  id: string;
  name: string;
  client: string;
  stage: string;
  status: string;
  caseNumber: string | null;
  court: string | null;
  disposition: string | null;
  nextDeadline: string | null; // YYYY-MM-DD; may be in the past (overdue)
  deadlineTitle: string | null; // the deadline task it came from, if any
  openCount: number;
  overdueCount: number;
}

/** Every matter with task rollups — the Cases hub list. */
export async function getCasesPageData(): Promise<{ cases: CaseRow[]; today: string }> {
  const sb = getSupabase();
  const today = todayISO();

  let [mattersRes, tasksRes] = await Promise.all([
    sb
      .from("matters")
      .select("id,name,client,stage,status,next_deadline,case_number,court,disposition"),
    sb
      .from("tasks")
      .select("matter_id,status,type,do_date,title")
      .neq("status", "Cancelled")
      .neq("status", "Done")
      .not("matter_id", "is", null),
  ]);
  if (mattersRes.error) {
    // Migration 0008 (disposition column) not applied yet — degrade gracefully.
    const retry = await sb
      .from("matters")
      .select("id,name,client,stage,status,next_deadline,case_number,court");
    mattersRes = retry as typeof mattersRes;
  }
  if (mattersRes.error) throw mattersRes.error;
  if (tasksRes.error) throw tasksRes.error;

  const byMatter = new Map<
    string,
    { open: number; overdue: number; dl: string | null; dlTitle: string | null }
  >();
  for (const t of tasksRes.data as {
    matter_id: string;
    status: string;
    type: string;
    do_date: string | null;
    title: string;
  }[]) {
    const agg = byMatter.get(t.matter_id) ?? { open: 0, overdue: 0, dl: null, dlTitle: null };
    if (t.status !== "Someday") {
      agg.open += 1;
      if (t.do_date && t.do_date < today) agg.overdue += 1;
      if (t.type === "Deadline" && t.do_date && (!agg.dl || t.do_date < agg.dl)) {
        agg.dl = t.do_date;
        agg.dlTitle = t.title;
      }
    }
    byMatter.set(t.matter_id, agg);
  }

  type MatterFull = MatterRowDB & {
    stage: string | null;
    case_number: string | null;
    court: string | null;
    disposition: string | null;
  };
  const cases: CaseRow[] = (mattersRes.data as MatterFull[]).map((m) => {
    const agg = byMatter.get(m.id) ?? { open: 0, overdue: 0, dl: null, dlTitle: null };
    // Soonest of the matter's own next_deadline and its open deadline tasks.
    let nextDeadline = agg.dl;
    let deadlineTitle = agg.dlTitle;
    if (m.next_deadline && (!nextDeadline || m.next_deadline < nextDeadline)) {
      nextDeadline = m.next_deadline;
      deadlineTitle = null;
    }
    return {
      id: m.id,
      name: m.name,
      client: m.client ?? "",
      stage: m.stage ?? "",
      status: m.status ?? "",
      caseNumber: m.case_number ?? null,
      court: m.court ?? null,
      disposition: m.disposition ?? null,
      nextDeadline,
      deadlineTitle,
      openCount: agg.open,
      overdueCount: agg.overdue,
    };
  });

  return { cases, today };
}

export interface TasksPageData {
  tasks: Task[]; // every open task (not Done, not Cancelled)
  matters: Matter[];
  today: string;
  running: RunningTimer | null;
}

/** All open tasks for the Tasks hub — the full audit view. */
export async function getTasksPageData(): Promise<TasksPageData> {
  const sb = getSupabase();
  const today = todayISO();

  const [tasksRes, mattersRes, runRes] = await Promise.all([
    sb
      .from("tasks")
      .select(TASK_COLUMNS)
      .neq("status", "Cancelled")
      .neq("status", "Done")
      .order("created_at", { ascending: true }),
    sb.from("matters").select("id,name,client,status,next_deadline"),
    sb
      .from("time_sessions")
      .select("id,task_id,started_at")
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (tasksRes.error) throw tasksRes.error;
  if (mattersRes.error) throw mattersRes.error;

  const running: RunningTimer | null = runRes.data
    ? {
        sessionId: runRes.data.id as string,
        taskId: runRes.data.task_id as string,
        startedAt: runRes.data.started_at as string,
      }
    : null;

  return {
    tasks: (tasksRes.data as TaskRowDB[]).map((r) => rowToTask(r, today)),
    matters: (mattersRes.data as MatterRowDB[]).map((r) => rowToMatter(r, today)),
    today,
    running,
  };
}

/** All data the My Day (Today) surface needs, for the current calendar day. */
export async function getMyDayData(): Promise<MyDayData> {
  const sb = getSupabase();
  const today = todayISO();

  const [tasksRes, mattersRes, runRes] = await Promise.all([
    sb
      .from("tasks")
      .select(TASK_COLUMNS)
      .neq("status", "Cancelled")
      .order("created_at", { ascending: true }),
    sb.from("matters").select("id,name,client,status,next_deadline"),
    sb
      .from("time_sessions")
      .select("id,task_id,started_at")
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (tasksRes.error) throw tasksRes.error;
  if (mattersRes.error) throw mattersRes.error;

  const running: RunningTimer | null = runRes.data
    ? {
        sessionId: runRes.data.id as string,
        taskId: runRes.data.task_id as string,
        startedAt: runRes.data.started_at as string,
      }
    : null;

  const all = (tasksRes.data as TaskRowDB[]).map((r) => rowToTask(r, today));
  const matters = (mattersRes.data as MatterRowDB[]).map((r) => rowToMatter(r, today));

  // Only the tasks that belong on My Day: protected MITs, anything in
  // progress, and anything scheduled for today.
  const tasks = all.filter(
    (t) => t.mit || t.status === "In Progress" || t.doDate === today
  );

  // Completed time tracked per task (running session excluded — the client adds it live).
  const logged: Record<string, number> = {};
  const taskIds = tasks.map((t) => t.id);
  if (taskIds.length) {
    const { data: sess } = await sb
      .from("time_sessions")
      .select("task_id,started_at,ended_at")
      .in("task_id", taskIds);
    for (const s of (sess ?? []) as { task_id: string; started_at: string; ended_at: string | null }[]) {
      if (!s.ended_at) continue;
      const sec = Math.max(
        0,
        (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000
      );
      logged[s.task_id] = (logged[s.task_id] ?? 0) + sec;
    }
  }

  return { tasks, matters, today, running, logged };
}
