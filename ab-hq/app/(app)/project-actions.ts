"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import type { Project, Task } from "@/lib/data";
import {
  PROJECT_COLUMNS,
  TASK_COLUMNS,
  rowToProject,
  rowToTask,
  todayISO,
  type ProjectRowDB,
  type TaskRowDB,
} from "@/lib/task-map";

export interface ProjectPatch {
  name?: string;
  matterId?: string | null;
  deadline?: string | null; // YYYY-MM-DD
  status?: string;
  notes?: string | null;
}

function toDb(patch: ProjectPatch): Record<string, unknown> {
  const db: Record<string, unknown> = {};
  if (patch.name !== undefined) db.name = patch.name;
  if (patch.matterId !== undefined) db.matter_id = patch.matterId;
  if (patch.deadline !== undefined) db.deadline = patch.deadline;
  if (patch.status !== undefined) {
    db.status = patch.status;
    db.completed_at = patch.status === "Done" ? new Date().toISOString() : null;
  }
  if (patch.notes !== undefined) db.notes = patch.notes;
  return db;
}

function revalidate() {
  revalidatePath("/work/projects");
  revalidatePath("/plan/today");
}

export async function createProject(
  name: string,
  matterId?: string | null
): Promise<{ ok: boolean; error?: string; project?: Project }> {
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Name is required." };
  const sb = getSupabase();
  const { data, error } = await sb
    .from("projects")
    .insert({ name: clean, matter_id: matterId ?? null })
    .select(PROJECT_COLUMNS)
    .single();
  revalidate();
  if (error || !data) return { ok: false, error: error?.message ?? "Insert failed" };
  return { ok: true, project: rowToProject(data as ProjectRowDB) };
}

export async function updateProject(
  id: string,
  patch: ProjectPatch
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb.from("projects").update(toDb(patch)).eq("id", id);
  revalidate();
  return { ok: !error, error: error?.message };
}

/** Tasks keep living — the FK nulls their project_id. */
export async function deleteProject(id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb.from("projects").delete().eq("id", id);
  revalidate();
  return { ok: !error, error: error?.message };
}

/** The project's tasks for the drawer — open first, then recent done. */
export async function listProjectTasks(
  projectId: string
): Promise<{ ok: boolean; error?: string; tasks: Task[] }> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("project_id", projectId)
    .neq("status", "Cancelled")
    .order("do_date", { ascending: true, nullsFirst: false })
    .limit(200);
  if (error) return { ok: false, error: error.message, tasks: [] };
  const today = todayISO();
  const tasks = (data as TaskRowDB[]).map((r) => rowToTask(r, today));
  const rank = (t: Task) => (t.status === "Done" ? 1 : 0);
  tasks.sort((a, b) => rank(a) - rank(b) || (a.doDate ?? "9999").localeCompare(b.doDate ?? "9999"));
  return { ok: true, tasks };
}
