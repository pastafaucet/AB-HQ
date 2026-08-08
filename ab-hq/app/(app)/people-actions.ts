"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";

export interface PersonPatch {
  name?: string;
  org?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export async function updatePerson(
  id: string,
  patch: PersonPatch
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb.from("people").update(patch).eq("id", id);
  revalidatePath("/hub/people");
  return { ok: !error, error: error?.message };
}

export async function createPerson(
  name: string
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const sb = getSupabase();
  const { data, error } = await sb.from("people").insert({ name }).select("id").single();
  revalidatePath("/hub/people");
  if (error || !data) return { ok: false, error: error?.message ?? "Insert failed" };
  return { ok: true, id: (data as { id: string }).id };
}

export async function deletePerson(id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb.from("people").delete().eq("id", id);
  revalidatePath("/hub/people");
  return { ok: !error, error: error?.message };
}

export async function linkPersonToMatter(
  personId: string,
  matterId: string,
  role: string
): Promise<{ ok: boolean; error?: string; linkId?: string }> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("matter_people")
    .insert({ matter_id: matterId, person_id: personId, role })
    .select("id")
    .single();
  revalidatePath("/hub/people");
  if (error || !data)
    return { ok: false, error: error?.message ?? "Couldn't link (already added?)" };
  return { ok: true, linkId: (data as { id: string }).id };
}
