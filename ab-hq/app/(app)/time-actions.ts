"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import type { TimeSession } from "@/lib/data";

interface Row {
  id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
  note: string | null;
}
const COLS = "id,task_id,started_at,ended_at,note";
function map(r: Row): TimeSession {
  return { id: r.id, taskId: r.task_id, startedAt: r.started_at, endedAt: r.ended_at, note: r.note };
}

export async function listSessions(taskId: string) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("time_sessions")
    .select(COLS)
    .eq("task_id", taskId)
    .order("started_at", { ascending: false });
  if (error) return { ok: false, error: error.message, sessions: [] as TimeSession[] };
  return { ok: true, sessions: (data as Row[]).map(map) };
}

/** Start a session for a task; stops any other running session first (one at a time). */
export async function startTimer(taskId: string) {
  const sb = getSupabase();
  const nowIso = new Date().toISOString();
  await sb.from("time_sessions").update({ ended_at: nowIso }).is("ended_at", null);
  const { data, error } = await sb
    .from("time_sessions")
    .insert({ task_id: taskId, started_at: nowIso })
    .select(COLS)
    .single();
  revalidatePath("/my-day");
  if (error || !data) return { ok: false, error: error?.message ?? "Start failed" };
  return { ok: true, session: map(data as Row) };
}

/** Stop whatever session is currently running. */
export async function stopTimer() {
  const sb = getSupabase();
  const nowIso = new Date().toISOString();
  const { error } = await sb.from("time_sessions").update({ ended_at: nowIso }).is("ended_at", null);
  revalidatePath("/my-day");
  return { ok: !error, error: error?.message, endedAt: nowIso };
}

/** Manually add a completed session (for logging past work). */
export async function addSession(taskId: string, startedAt: string, endedAt: string) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("time_sessions")
    .insert({ task_id: taskId, started_at: startedAt, ended_at: endedAt })
    .select(COLS)
    .single();
  revalidatePath("/my-day");
  if (error || !data) return { ok: false, error: error?.message ?? "Add failed" };
  return { ok: true, session: map(data as Row) };
}

export async function updateSession(
  id: string,
  patch: { startedAt?: string; endedAt?: string | null; note?: string | null }
) {
  const sb = getSupabase();
  const db: Record<string, unknown> = {};
  if (patch.startedAt !== undefined) db.started_at = patch.startedAt;
  if (patch.endedAt !== undefined) db.ended_at = patch.endedAt;
  if (patch.note !== undefined) db.note = patch.note;
  const { error } = await sb.from("time_sessions").update(db).eq("id", id);
  revalidatePath("/my-day");
  return { ok: !error, error: error?.message };
}

export async function deleteSession(id: string) {
  const sb = getSupabase();
  const { error } = await sb.from("time_sessions").delete().eq("id", id);
  revalidatePath("/my-day");
  return { ok: !error, error: error?.message };
}
