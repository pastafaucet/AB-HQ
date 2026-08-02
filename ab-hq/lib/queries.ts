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

  return { tasks, matters, today, running };
}
