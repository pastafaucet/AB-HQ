"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";

export type NoteTargetType = "matter" | "task" | "person";

export interface NotePatch {
  title?: string | null;
  bodyJson?: unknown;
  bodyText?: string;
  pinned?: boolean;
}

export interface NoteStub {
  id: string;
  title: string | null;
  createdAt: string;
}

export async function createNote(): Promise<{ ok: boolean; error?: string; id?: string; createdAt?: string }> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("notes")
    .insert({ title: null, body: "" })
    .select("id,created_at")
    .single();
  revalidatePath("/hub/notes");
  if (error || !data) return { ok: false, error: error?.message ?? "Insert failed" };
  const row = data as { id: string; created_at: string };
  return { ok: true, id: row.id, createdAt: row.created_at };
}

/** Create a note already linked to a case/task/person (drawer "+ Note"). */
export async function createNoteForTarget(
  targetType: NoteTargetType,
  targetId: string
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const r = await createNote();
  if (!r.ok || !r.id) return r;
  const sb = getSupabase();
  await sb.from("note_links").insert({ note_id: r.id, target_type: targetType, target_id: targetId });
  revalidatePath("/hub/notes");
  return { ok: true, id: r.id };
}

export async function updateNote(id: string, patch: NotePatch): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const db: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) db.title = patch.title;
  if (patch.bodyJson !== undefined) db.body_json = patch.bodyJson;
  if (patch.bodyText !== undefined) db.body = patch.bodyText;
  if (patch.pinned !== undefined) db.pinned = patch.pinned;
  const { error } = await sb.from("notes").update(db).eq("id", id);
  revalidatePath("/hub/notes");
  return { ok: !error, error: error?.message };
}

export async function deleteNote(id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb.from("notes").delete().eq("id", id);
  revalidatePath("/hub/notes");
  return { ok: !error, error: error?.message };
}

export async function addNoteLink(
  noteId: string,
  targetType: NoteTargetType,
  targetId: string
): Promise<{ ok: boolean; error?: string; linkId?: string }> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("note_links")
    .insert({ note_id: noteId, target_type: targetType, target_id: targetId })
    .select("id")
    .single();
  revalidatePath("/hub/notes");
  if (error || !data) return { ok: false, error: error?.message ?? "Already linked?" };
  return { ok: true, linkId: (data as { id: string }).id };
}

export async function removeNoteLink(linkId: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb.from("note_links").delete().eq("id", linkId);
  revalidatePath("/hub/notes");
  return { ok: !error, error: error?.message };
}

/** Note stubs for one case/task/person — shown inside their drawers. */
export async function listNotesForTarget(
  targetType: NoteTargetType,
  targetId: string
): Promise<{ ok: boolean; error?: string; notes: NoteStub[] }> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("note_links")
    .select("note_id,notes(id,title,created_at)")
    .eq("target_type", targetType)
    .eq("target_id", targetId);
  if (error) return { ok: false, error: error.message, notes: [] };
  const notes = (data as unknown as {
    notes: { id: string; title: string | null; created_at: string } | null;
  }[])
    .filter((r) => r.notes)
    .map((r) => ({ id: r.notes!.id, title: r.notes!.title, createdAt: r.notes!.created_at }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ok: true, notes };
}
