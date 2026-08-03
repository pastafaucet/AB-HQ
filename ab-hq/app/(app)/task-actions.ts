"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { rowToTask, TASK_COLUMNS, todayISO } from "@/lib/task-map";
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
  doDate?: string | null;
  doTime?: string | null;
  durationMin?: number | null;
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
  if (patch.doDate !== undefined) db.do_date = patch.doDate;
  if (patch.doTime !== undefined) db.do_time = patch.doTime;
  if (patch.durationMin !== undefined) db.duration_min = patch.durationMin;
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
  if (!error) await logActivity(id, done ? "Completed" : "Reopened");
  revalidatePath("/my-day");
  return { ok: !error, error: error?.message };
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
  const { error } = await sb.from("tasks").update(toDbPatch(patch)).eq("id", id);
  if (!error && cur) {
    const today = todayISO();
    if (patch.priority !== undefined && patch.priority !== cur.priority)
      await logActivity(id, `Priority set to P${patch.priority}`);
    if (patch.status !== undefined && patch.status !== cur.status)
      await logActivity(id, patch.status === "Done" ? "Completed" : `Status → ${patch.status}`);
    if (patch.doDate !== undefined && patch.doDate === today && cur.do_date !== today)
      await logActivity(id, "Moved to today");
    if (patch.mit !== undefined && patch.mit !== cur.mit)
      await logActivity(id, patch.mit ? "Added to Top-3" : "Removed from Top-3");
  }
  revalidatePath("/my-day");
  return { ok: !error, error: error?.message };
}

export async function createTask(input: TaskPatch & { title: string }): Promise<ActionResult> {
  const sb = getSupabase();
  let mit = input.mit === true;
  if (mit && (await protectedCount()) >= MIT_CAP) mit = false;

  const row = {
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
    notes: input.notes ?? null,
  };

  const { data, error } = await sb.from("tasks").insert(row).select(TASK_COLUMNS).single();
  if (error || !data) {
    revalidatePath("/my-day");
    return { ok: false, error: error?.message ?? "Insert failed" };
  }
  await logActivity((data as { id: string }).id, "Created");
  revalidatePath("/my-day");
  return { ok: true, task: rowToTask(data as never, todayISO()) };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const sb = getSupabase();
  const { error } = await sb.from("tasks").delete().eq("id", id);
  revalidatePath("/my-day");
  return { ok: !error, error: error?.message };
}
