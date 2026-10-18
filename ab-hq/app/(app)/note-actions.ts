"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";

export type NoteTargetType = "matter" | "task" | "person";

export interface NotePatch {
  title?: string | null;
  bodyJson?: unknown;
  bodyText?: string;
  pinned?: boolean;
  status?: "Inbox" | "Active" | "Archived";
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
  if (patch.status !== undefined) db.status = patch.status;
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
    .select("note_id,notes(id,title,body,created_at)")
    .eq("target_type", targetType)
    .eq("target_id", targetId);
  if (error) return { ok: false, error: error.message, notes: [] };
  const notes = (data as unknown as {
    notes: { id: string; title: string | null; body: string | null; created_at: string } | null;
  }[])
    .filter((r) => r.notes)
    .map((r) => ({
      id: r.notes!.id,
      // Untitled notes borrow their first line as a display title.
      title: r.notes!.title ?? r.notes!.body?.trim().split("\n")[0]?.slice(0, 60) ?? null,
      createdAt: r.notes!.created_at,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ok: true, notes };
}

// ---------- images ----------
// Pasted/dropped images live in a PRIVATE storage bucket. The browser uploads
// straight to storage with a one-time signed URL (no Vercel body-size cap),
// and notes reference /api/note-images/<id>, which only serves behind the
// passcode. The id deliberately has no file extension: the middleware skips
// auth for paths ending in .png/.jpg.

const IMAGE_BUCKET = "note-images";
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

async function ensureImageBucket() {
  const sb = getSupabase();
  const { data } = await sb.storage.getBucket(IMAGE_BUCKET);
  if (data) return;
  await sb.storage.createBucket(IMAGE_BUCKET, {
    public: false,
    fileSizeLimit: "25MB",
    allowedMimeTypes: IMAGE_TYPES,
  });
}

export async function startNoteImageUpload(
  contentType: string
): Promise<{ ok: boolean; error?: string; uploadUrl?: string; src?: string }> {
  if (!IMAGE_TYPES.includes(contentType)) {
    return { ok: false, error: "Only PNG, JPEG, GIF, and WebP images can go in a note." };
  }
  const sb = getSupabase();
  const id = crypto.randomUUID();
  let res = await sb.storage.from(IMAGE_BUCKET).createSignedUploadUrl(id);
  if (res.error) {
    await ensureImageBucket();
    res = await sb.storage.from(IMAGE_BUCKET).createSignedUploadUrl(id);
  }
  if (res.error || !res.data) return { ok: false, error: res.error?.message ?? "Upload couldn't start." };
  return { ok: true, uploadUrl: res.data.signedUrl, src: `/api/note-images/${id}` };
}

// ---------- tags ----------

export interface NoteTagRow {
  noteTagId: string;
  tagId: string;
  name: string;
}

/** Attach a tag (lowercased) to a note, creating the tag if new. */
export async function addTagToNote(
  noteId: string,
  rawName: string
): Promise<{ ok: boolean; error?: string; tag?: NoteTagRow }> {
  const name = rawName.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-");
  if (!name) return { ok: false, error: "Tag name is required." };
  const sb = getSupabase();

  const { data: existing } = await sb.from("tags").select("id,name").eq("name", name).maybeSingle();
  let tag = existing as { id: string; name: string } | null;
  if (!tag) {
    const { data: created, error: cErr } = await sb
      .from("tags")
      .insert({ name })
      .select("id,name")
      .single();
    if (cErr || !created) return { ok: false, error: cErr?.message ?? "Couldn't create tag" };
    tag = created as { id: string; name: string };
  }

  const { data: link, error: lErr } = await sb
    .from("note_tags")
    .insert({ note_id: noteId, tag_id: tag.id })
    .select("id")
    .single();
  if (lErr || !link) return { ok: false, error: lErr?.message ?? "Already tagged?" };
  revalidatePath("/hub/notes");
  return { ok: true, tag: { noteTagId: (link as { id: string }).id, tagId: tag.id, name: tag.name } };
}

export async function removeTagFromNote(
  noteTagId: string
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb.from("note_tags").delete().eq("id", noteTagId);
  revalidatePath("/hub/notes");
  return { ok: !error, error: error?.message };
}
