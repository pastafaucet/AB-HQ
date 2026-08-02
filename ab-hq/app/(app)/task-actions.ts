"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { rowToTask, TASK_COLUMNS, todayISO } from "@/lib/task-map";
import type { Task } from "@/lib/data";

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
  revalidatePath("/my-day");
  return { ok: !error, error: error?.message };
}

export async function updateTask(id: string, patch: TaskPatch): Promise<ActionResult> {
  if (patch.mit === true && (await protectedCount(id)) >= MIT_CAP) {
    return { ok: false, error: `You already have ${MIT_CAP} protected tasks — clear one first.` };
  }
  const sb = getSupabase();
  const { error } = await sb.from("tasks").update(toDbPatch(patch)).eq("id", id);
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
  revalidatePath("/my-day");
  if (error || !data) return { ok: false, error: error?.message ?? "Insert failed" };
  return { ok: true, task: rowToTask(data as never, todayISO()) };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const sb = getSupabase();
  const { error } = await sb.from("tasks").delete().eq("id", id);
  revalidatePath("/my-day");
  return { ok: !error, error: error?.message };
}
