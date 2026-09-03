"use server";

import { getSupabase } from "@/lib/supabase";

// Ritual state on daily_entries (scope §4) — one row per calendar day.

export async function saveIntention(
  date: string,
  intention: string | null
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb
    .from("daily_entries")
    .upsert({ date, intention }, { onConflict: "date" });
  return { ok: !error, error: error?.message };
}

/** Wind Down writes today's close-out; Start Up reads on_tap tomorrow morning. */
export async function saveWindDown(
  date: string,
  patch: { onTapForTomorrow?: string | null; reflection?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const row: Record<string, unknown> = { date };
  if (patch.onTapForTomorrow !== undefined) row.on_tap_for_tomorrow = patch.onTapForTomorrow;
  if (patch.reflection !== undefined) row.reflection = patch.reflection;
  const { error } = await sb.from("daily_entries").upsert(row, { onConflict: "date" });
  return { ok: !error, error: error?.message };
}
