"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";

// Journal, media/games log, habits, body metrics — the life half of the loop.

function revalidate() {
  revalidatePath("/plan/today");
}

const MIGRATION_HINT = "Run migration 0015 in Supabase first.";
function friendly(msg: string | undefined): string {
  if (!msg) return "Couldn't save.";
  return /media_log|habit|body_metrics|journal/.test(msg) ? MIGRATION_HINT : msg;
}

export async function saveJournal(
  date: string,
  journal: string | null
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb.from("daily_entries").upsert({ date, journal }, { onConflict: "date" });
  return { ok: !error, error: friendly(error?.message) };
}

export interface MediaItem {
  id: string;
  date: string;
  kind: "show" | "movie" | "game" | "book";
  title: string;
  note: string | null;
}

export async function logMedia(
  date: string,
  kind: MediaItem["kind"],
  title: string,
  note: string | null
): Promise<{ ok: boolean; error?: string; item?: MediaItem }> {
  const clean = title.trim();
  if (!clean) return { ok: false, error: "Title required." };
  const sb = getSupabase();
  const { data, error } = await sb
    .from("media_log")
    .insert({ date, kind, title: clean, note: note?.trim() || null })
    .select("id,date,kind,title,note")
    .single();
  revalidate();
  if (error || !data) return { ok: false, error: friendly(error?.message) };
  return { ok: true, item: data as MediaItem };
}

export async function deleteMedia(id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb.from("media_log").delete().eq("id", id);
  revalidate();
  return { ok: !error, error: friendly(error?.message) };
}

export async function addHabit(
  name: string
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Name required." };
  const sb = getSupabase();
  const { data, error } = await sb.from("habits").insert({ name: clean }).select("id").single();
  revalidate();
  if (error || !data) return { ok: false, error: friendly(error?.message) };
  return { ok: true, id: (data as { id: string }).id };
}

export async function archiveHabit(id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb.from("habits").update({ active: false }).eq("id", id);
  revalidate();
  return { ok: !error, error: friendly(error?.message) };
}

export async function setHabitChecked(
  habitId: string,
  date: string,
  checked: boolean
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = checked
    ? (await sb.from("habit_checks").upsert({ habit_id: habitId, date }, { onConflict: "habit_id,date" }))
    : (await sb.from("habit_checks").delete().eq("habit_id", habitId).eq("date", date));
  revalidate();
  return { ok: !error, error: friendly(error?.message) };
}

export interface BodyPatch {
  weightLbs?: number | null;
  sleepHours?: number | null;
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  workout?: string | null;
}

export async function saveBodyMetrics(
  date: string,
  patch: BodyPatch
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const row: Record<string, unknown> = { date, updated_at: new Date().toISOString() };
  if (patch.weightLbs !== undefined) row.weight_lbs = patch.weightLbs;
  if (patch.sleepHours !== undefined) row.sleep_hours = patch.sleepHours;
  if (patch.calories !== undefined) row.calories = patch.calories;
  if (patch.proteinG !== undefined) row.protein_g = patch.proteinG;
  if (patch.carbsG !== undefined) row.carbs_g = patch.carbsG;
  if (patch.fatG !== undefined) row.fat_g = patch.fatG;
  if (patch.workout !== undefined) row.workout = patch.workout;
  const { error } = await sb.from("body_metrics").upsert(row, { onConflict: "date" });
  revalidate();
  return { ok: !error, error: friendly(error?.message) };
}
