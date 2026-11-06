"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import {
  rowToTask,
  selectTaskRows,
  TASK_COLUMNS,
  TASK_COLUMNS_WITH_END,
  TASK_COLUMNS_LEGACY,
  todayISO,
  type TaskRowDB,
} from "@/lib/task-map";
import { parseRule, nextOccurrence } from "@/lib/recur";
import { addDays, daysBetween } from "@/lib/task-dates";
import type { Task, ActivityItem } from "@/lib/data";

async function logActivity(taskId: string, detail: string) {
  const sb = getSupabase();
  await sb.from("task_activity").insert({ task_id: taskId, detail });
}

export async function listActivity(taskId: string) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("task_activity")
    .select("id,task_id,detail,created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message, activity: [] as ActivityItem[] };
  return {
    ok: true,
    activity: (data as { id: string; task_id: string; detail: string; created_at: string }[]).map(
      (r) => ({ id: r.id, taskId: r.task_id, detail: r.detail, createdAt: r.created_at })
    ),
  };
}

export interface TaskPatch {
  title?: string;
  priority?: number;
  mit?: boolean;
  status?: string;
  domain?: string;
  type?: string;
  matterId?: string | null;
  projectId?: string | null;
  waitingOn?: string | null;
  recur?: string | null;
  doDate?: string | null;
  doTime?: string | null;
  durationMin?: number | null;
  endDate?: string | null; // multi-day items only (migration 0016)
  endTime?: string | null;
  notes?: string | null;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  task?: Task;
}

const MIT_CAP = 3;

async function protectedCount(excludeId?: string): Promise<number> {
  const sb = getSupabase();
  let q = sb.from("tasks").select("*", { count: "exact", head: true }).eq("mit", true);
  if (excludeId) q = q.neq("id", excludeId);
  const { count } = await q;
  return count ?? 0;
}

function toDbPatch(patch: TaskPatch): Record<string, unknown> {
  const db: Record<string, unknown> = {};
  if (patch.title !== undefined) db.title = patch.title;
  if (patch.priority !== undefined) db.priority = patch.priority;
  if (patch.mit !== undefined) db.mit = patch.mit;
  if (patch.status !== undefined) db.status = patch.status;
  if (patch.domain !== undefined) db.domain = patch.domain;
  if (patch.type !== undefined) db.type = patch.type;
  if (patch.matterId !== undefined) db.matter_id = patch.matterId;
  if (patch.projectId !== undefined) db.project_id = patch.projectId;
  if (patch.waitingOn !== undefined) db.waiting_on = patch.waitingOn;
  if (patch.recur !== undefined) db.recur = patch.recur;
  if (patch.doDate !== undefined) db.do_date = patch.doDate;
  if (patch.doTime !== undefined) db.do_time = patch.doTime;
  if (patch.durationMin !== undefined) db.duration_min = patch.durationMin;
  if (patch.endDate !== undefined) db.end_date = patch.endDate;
  if (patch.endTime !== undefined) db.end_time = patch.endTime;
  if (patch.notes !== undefined) db.notes = patch.notes;
  if (patch.status === "Done") db.completed_at = new Date().toISOString();
  if (patch.status && patch.status !== "Done") db.completed_at = null;
  return db;
}

export async function setTaskDone(id: string, done: boolean): Promise<ActionResult> {
  const sb = getSupabase();
  const { error } = await sb
    .from("tasks")
    .update({
      status: done ? "Done" : "To Do",
      completed_at: done ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (!error) {
    await logActivity(id, done ? "Completed" : "Reopened");
    if (done) await spawnNextIfRecurring(id);
  }
  revalidatePath("/plan/today");
  return { ok: !error, error: error?.message };
}

/**
 * Completing a recurring task spawns the next instance and hands the rule
 * to it (the done instance stays in history, rule cleared). The next date
 * is the first occurrence after both the task's date and today — so an
 * overdue weekly task completed late doesn't spawn into the past.
 */
async function spawnNextIfRecurring(id: string): Promise<void> {
  const sb = getSupabase();
  const withEnd = await sb.from("tasks").select(TASK_COLUMNS_WITH_END).eq("id", id).maybeSingle();
  const t = withEnd.error
    ? (await sb.from("tasks").select(TASK_COLUMNS).eq("id", id).maybeSingle()).data
    : withEnd.data;
  const row = t as TaskRowDB | null;
  if (!row?.recur) return;
  const rule = parseRule(row.recur);
  if (!rule) return;

  const today = todayISO();
  let next = row.do_date && row.do_date > today ? row.do_date : today;
  // Advance from the later of (scheduled date, today) to the next occurrence.
  next = nextOccurrence(rule, next);

  const clone: Record<string, unknown> = {
    title: row.title,
    status: "To Do",
    domain: row.domain,
    type: row.type,
    priority: row.priority,
    mit: false,
    do_date: next,
    do_time: row.do_time,
    duration_min: row.duration_min,
    matter_id: row.matter_id,
    project_id: row.project_id,
    waiting_on: row.waiting_on,
    recur: row.recur,
  };
  // A multi-day item keeps its length: a 3-day trip recurs as a 3-day trip.
  if (row.do_date && row.end_date && row.end_date > row.do_date) {
    clone.end_date = addDays(next, daysBetween(row.do_date, row.end_date));
    clone.end_time = row.end_time ?? null;
  }
  const { data: created, error } = await sb.from("tasks").insert(clone).select("id").single();
  if (!error && created) {
    await sb.from("tasks").update({ recur: null }).eq("id", id);
    await logActivity(id, `Recurred → next on ${next}`);
    await logActivity((created as { id: string }).id, "Created (recurrence)");
  }
}

export async function updateTask(id: string, patch: TaskPatch): Promise<ActionResult> {
  if (patch.mit === true && (await protectedCount(id)) >= MIT_CAP) {
    return { ok: false, error: `You already have ${MIT_CAP} protected tasks — clear one first.` };
  }
  const sb = getSupabase();
  const { data: cur } = await sb
    .from("tasks")
    .select("priority,status,do_date,mit")
    .eq("id", id)
    .single();
  const db = toDbPatch(patch);
  let { error } = await sb.from("tasks").update(db).eq("id", id);
  if (error && ("end_date" in db || "end_time" in db)) {
    // Before migration 0016 the end columns don't exist. Save everything
    // else; only complain if an end date was actually being set.
    const wanted = !!(patch.endDate || patch.endTime);
    delete db.end_date;
    delete db.end_time;
    ({ error } = await sb.from("tasks").update(db).eq("id", id));
    if (!error && wanted) {
      revalidatePath("/plan/today");
      return { ok: false, error: "Saved, except the end date: run migration 0016 in Supabase first." };
    }
  }
  if (!error && cur) {
    const today = todayISO();
    if (patch.priority !== undefined && patch.priority !== cur.priority)
      await logActivity(id, `Priority set to P${patch.priority}`);
    if (patch.status !== undefined && patch.status !== cur.status) {
      await logActivity(id, patch.status === "Done" ? "Completed" : `Status → ${patch.status}`);
      if (patch.status === "Done") await spawnNextIfRecurring(id);
    }
    if (patch.doDate !== undefined && patch.doDate === today && cur.do_date !== today)
      await logActivity(id, "Moved to today");
    if (patch.mit !== undefined && patch.mit !== cur.mit)
      await logActivity(id, patch.mit ? "Added to Top-3" : "Removed from Top-3");
  }
  revalidatePath("/plan/today");
  return { ok: !error, error: error?.message };
}

export async function createTask(input: TaskPatch & { title: string }): Promise<ActionResult> {
  const sb = getSupabase();
  let mit = input.mit === true;
  if (mit && (await protectedCount()) >= MIT_CAP) mit = false;

  const row: Record<string, unknown> = {
    title: input.title,
    status: input.status ?? "To Do",
    domain: input.domain ?? "Work",
    type: input.type ?? "Task",
    priority: input.priority ?? 3,
    mit,
    do_date: input.doDate ?? null,
    do_time: input.doTime ?? null,
    duration_min: input.durationMin ?? null,
    matter_id: input.matterId ?? null,
    // Omitted when unset so inserts still work before migrations 0011/0012.
    ...(input.projectId ? { project_id: input.projectId } : {}),
    ...(input.waitingOn ? { waiting_on: input.waitingOn } : {}),
    ...(input.recur ? { recur: input.recur } : {}),
    ...(input.endDate ? { end_date: input.endDate } : {}),
    ...(input.endTime ? { end_time: input.endTime } : {}),
    notes: input.notes ?? null,
  };

  let { data, error } = await sb.from("tasks").insert(row).select(TASK_COLUMNS).single();
  if (error && ("end_date" in row || "end_time" in row)) {
    // Pre-0016: create it without the end date rather than not at all.
    delete row.end_date;
    delete row.end_time;
    ({ data, error } = await sb.from("tasks").insert(row).select(TASK_COLUMNS).single());
  }
  if (error && !input.projectId) {
    // Pre-0011 the returning column set errors; the failed insert rolls back.
    ({ data, error } = await sb.from("tasks").insert(row).select(TASK_COLUMNS_LEGACY).single());
  }
  if (error || !data) {
    revalidatePath("/plan/today");
    return { ok: false, error: error?.message ?? "Insert failed" };
  }
  await logActivity((data as { id: string }).id, "Created");
  revalidatePath("/plan/today");
  return { ok: true, task: rowToTask(data as never, todayISO()) };
}

/** Completed tasks, newest first. `sinceIso` bounds the window; null = all time. */
export async function listDoneTasks(
  sinceIso: string | null
): Promise<{ ok: boolean; error?: string; tasks: Task[] }> {
  const sb = getSupabase();
  try {
    const rows = await selectTaskRows((cols) => {
      let q = sb
        .from("tasks")
        .select(cols)
        .eq("status", "Done")
        .order("completed_at", { ascending: false })
        .limit(1000);
      if (sinceIso) q = q.gte("completed_at", sinceIso);
      return q;
    });
    const today = todayISO();
    return { ok: true, tasks: rows.map((r) => rowToTask(r, today)) };
  } catch (e) {
    return { ok: false, error: (e as { message?: string }).message ?? "Query failed", tasks: [] };
  }
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const sb = getSupabase();
  const { error } = await sb.from("tasks").delete().eq("id", id);
  revalidatePath("/plan/today");
  return { ok: !error, error: error?.message };
}
