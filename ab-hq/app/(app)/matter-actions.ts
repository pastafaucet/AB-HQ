"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";

export interface MatterPatch {
  name?: string;
  client?: string | null;
  status?: string | null;
  caseNumber?: string | null;
  court?: string | null;
  nextDeadline?: string | null; // YYYY-MM-DD
  disposition?: string | null;
}

export interface MatterPersonRow {
  linkId: string;
  personId: string;
  name: string;
  org: string | null;
  role: string;
}

export interface PersonOption {
  id: string;
  name: string;
  org: string | null;
}

function toDb(patch: MatterPatch): Record<string, unknown> {
  const db: Record<string, unknown> = {};
  if (patch.name !== undefined) db.name = patch.name;
  if (patch.client !== undefined) db.client = patch.client;
  if (patch.status !== undefined) db.status = patch.status;
  if (patch.caseNumber !== undefined) db.case_number = patch.caseNumber;
  if (patch.court !== undefined) db.court = patch.court;
  if (patch.nextDeadline !== undefined) db.next_deadline = patch.nextDeadline;
  if (patch.disposition !== undefined) db.disposition = patch.disposition;
  // Closing stamps closed_at; reopening (or clearing the disposition) clears it.
  if (patch.status !== undefined || patch.disposition !== undefined) {
    if (patch.status === "Closed" || patch.disposition) db.closed_at = new Date().toISOString();
    else db.closed_at = null;
  }
  return db;
}

export async function updateMatter(
  id: string,
  patch: MatterPatch
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb.from("matters").update(toDb(patch)).eq("id", id);
  revalidatePath("/hub/cases");
  return { ok: !error, error: error?.message };
}

export async function createMatter(
  name: string
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("matters")
    .insert({ name, status: "Active" })
    .select("id")
    .single();
  revalidatePath("/hub/cases");
  if (error || !data) return { ok: false, error: error?.message ?? "Insert failed" };
  return { ok: true, id: (data as { id: string }).id };
}

export async function listMatterPeople(
  matterId: string
): Promise<{ ok: boolean; error?: string; people: MatterPersonRow[] }> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("matter_people")
    .select("id,role,person_id,people(id,name,org)")
    .eq("matter_id", matterId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message, people: [] };
  const rows = (data as unknown as {
    id: string;
    role: string;
    person_id: string;
    people: { id: string; name: string; org: string | null } | null;
  }[])
    .filter((r) => r.people)
    .map((r) => ({
      linkId: r.id,
      personId: r.person_id,
      name: r.people!.name,
      org: r.people!.org,
      role: r.role,
    }));
  return { ok: true, people: rows };
}

export async function listAllPeople(): Promise<{
  ok: boolean;
  error?: string;
  people: PersonOption[];
}> {
  const sb = getSupabase();
  const { data, error } = await sb.from("people").select("id,name,org").order("name");
  if (error) return { ok: false, error: error.message, people: [] };
  return { ok: true, people: data as PersonOption[] };
}

/** Attach a person to a matter, creating the person if they're new. */
export async function addPersonToMatter(
  matterId: string,
  name: string,
  org: string | null,
  role: string
): Promise<{ ok: boolean; error?: string; person?: MatterPersonRow }> {
  const sb = getSupabase();
  const cleanName = name.trim();
  if (!cleanName) return { ok: false, error: "Name is required." };
  const cleanOrg = org?.trim() || null;

  // Reuse an existing person on exact name(+org) match, else create.
  let query = sb.from("people").select("id,name,org").ilike("name", cleanName);
  query = cleanOrg ? query.ilike("org", cleanOrg) : query.is("org", null);
  const { data: existing } = await query.limit(1).maybeSingle();

  let person = existing as PersonOption | null;
  if (!person) {
    const { data: created, error: cErr } = await sb
      .from("people")
      .insert({ name: cleanName, org: cleanOrg })
      .select("id,name,org")
      .single();
    if (cErr || !created) return { ok: false, error: cErr?.message ?? "Couldn't create person" };
    person = created as PersonOption;
  }

  const { data: link, error: lErr } = await sb
    .from("matter_people")
    .insert({ matter_id: matterId, person_id: person.id, role })
    .select("id")
    .single();
  if (lErr || !link)
    return { ok: false, error: lErr?.message ?? "Couldn't link person (already added?)" };
  revalidatePath("/hub/cases");
  return {
    ok: true,
    person: {
      linkId: (link as { id: string }).id,
      personId: person.id,
      name: person.name,
      org: person.org,
      role,
    },
  };
}

export async function removePersonFromMatter(
  linkId: string
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb.from("matter_people").delete().eq("id", linkId);
  revalidatePath("/hub/cases");
  return { ok: !error, error: error?.message };
}
