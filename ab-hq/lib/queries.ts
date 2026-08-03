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
