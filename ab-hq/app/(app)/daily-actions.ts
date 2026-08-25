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
