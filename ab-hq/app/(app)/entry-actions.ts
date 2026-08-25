"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import type { Entry, EntryKind } from "@/lib/data";
import { routeEntry, hasRoutingKey } from "@/lib/route-entry";
import { todayISO } from "@/lib/task-map";
import { ENTRY_COLUMNS, rowToEntry as toEntry, type EntryRowDB } from "@/lib/entry-map";

function revalidate() {
  revalidatePath("/hub/inbox");
  revalidatePath("/start-up");
  revalidatePath("/my-day");
}

export interface CaptureResult {
  ok: boolean;
  error?: string;
  entry?: Entry;
  // Human-readable routing outcome for the capture toast.
  routedTo?: string | null; // matter/project label, null = unfiled
  madeTask?: string | null; // created task title, if any
}

/**
 * The one box. Insert the raw entry immediately (capture never waits on AI),
 * then route it: classify, attach matter/project, extract a task if one is
 * implied. AI-routed entries with a matter file themselves; everything
 * uncertain stays in the Inbox for a one-click correction.
 */
export async function captureEntry(raw: string): Promise<CaptureResult> {
  const clean = raw.trim();
  if (!clean) return { ok: false, error: "Empty entry." };
  const sb = getSupabase();

  const { data: inserted, error: insErr } = await sb
    .from("entries")
    .insert({ raw: clean })
    .select(ENTRY_COLUMNS)
    .single();
  if (insErr || !inserted) {
    const hint = insErr?.message?.includes("entries")
      ? "The entries table doesn't exist yet — run migration 0012 in Supabase."
      : insErr?.message;
    return { ok: false, error: hint ?? "Couldn't save." };
  }
  const entry = toEntry(inserted as EntryRowDB);

  // Fetch routing context (open matters + active projects).
  const [mattersRes, projectsRes] = await Promise.all([
    sb.from("matters").select("id,name,client,status,disposition"),
    sb.from("projects").select("id,name,status"),
  ]);
  const matters = ((mattersRes.data ?? []) as {
    id: string;
    name: string;
    client: string | null;
    status: string | null;
    disposition: string | null;
  }[]).filter((m) => m.status !== "Closed" && !m.disposition);
  const projects = ((projectsRes.data ?? []) as { id: string; name: string; status: string }[]).filter(
    (p) => p.status === "Active"
  );

  const route = await routeEntry(clean, todayISO(), matters, projects);
  if (!route) {
    revalidate();
    return {
      ok: true,
      entry,
      routedTo: null,
      madeTask: null,
      error: hasRoutingKey() ? undefined : "Saved unrouted — AI routing key not configured.",
    };
  }

  // Derive a task when the entry implies one.
  let taskId: string | null = null;
  let madeTask: string | null = null;
  if ((route.kind === "task" || route.kind === "event") && route.title) {
    const taskRow: Record<string, unknown> = {
      title: route.title,
      status: route.doDate ? "To Do" : "Inbox",
      domain: "Work",
      type: route.taskType ?? (route.kind === "event" ? "Event" : "Task"),
      priority: route.priority ?? 3,
      mit: false,
      do_date: route.doDate,
      do_time: route.doTime,
      matter_id: route.matterId,
      project_id: route.projectId,
    };
    if (route.waitingOn) taskRow.waiting_on = route.waitingOn;
    let { data: t, error: tErr } = await sb.from("tasks").insert(taskRow).select("id").single();
    if (tErr && route.waitingOn) {
      // Pre-0012 tasks table — retry without the new column.
      delete taskRow.waiting_on;
      ({ data: t, error: tErr } = await sb.from("tasks").insert(taskRow).select("id").single());
    }
    if (!tErr && t) {
      taskId = (t as { id: string }).id;
      madeTask = route.title;
    }
  }

  // Entries with a confident matter (or a derived task) file themselves;
  // the rest wait in the Inbox for a one-click assignment.
  const status = route.matterId || taskId ? "filed" : "inbox";
  const { data: updated } = await sb
    .from("entries")
    .update({
      kind: route.kind,
      status,
      matter_id: route.matterId,
      project_id: route.projectId,
      task_id: taskId,
      summary: route.summary,
      routed_by: "ai",
    })
    .eq("id", entry.id)
    .select(ENTRY_COLUMNS)
    .single();

  revalidate();
  const matterName = route.matterId
    ? matters.find((m) => m.id === route.matterId)?.name ?? null
    : null;
  return {
    ok: true,
    entry: updated ? toEntry(updated as EntryRowDB) : entry,
    routedTo: matterName,
    madeTask,
  };
}

export interface EntryPatch {
  kind?: EntryKind;
  status?: Entry["status"];
  matterId?: string | null;
  projectId?: string | null;
  summary?: string | null;
}

export async function updateEntry(
  id: string,
  patch: EntryPatch
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const db: Record<string, unknown> = { routed_by: "manual" };
  if (patch.kind !== undefined) db.kind = patch.kind;
  if (patch.status !== undefined) db.status = patch.status;
  if (patch.matterId !== undefined) db.matter_id = patch.matterId;
  if (patch.projectId !== undefined) db.project_id = patch.projectId;
  if (patch.summary !== undefined) db.summary = patch.summary;
  const { error } = await sb.from("entries").update(db).eq("id", id);
  revalidate();
  return { ok: !error, error: error?.message };
}

/** Manually promote an entry to a task (for ones the AI left as log/note). */
export async function entryToTask(
  id: string
): Promise<{ ok: boolean; error?: string; taskTitle?: string }> {
  const sb = getSupabase();
  const { data: e, error: eErr } = await sb
    .from("entries")
    .select(ENTRY_COLUMNS)
    .eq("id", id)
    .single();
  if (eErr || !e) return { ok: false, error: eErr?.message ?? "Not found" };
  const entry = e as EntryRowDB;
  const title = (entry.summary ?? entry.raw).slice(0, 200);
  const { data: t, error: tErr } = await sb
    .from("tasks")
    .insert({
      title,
      status: "Inbox",
      domain: "Work",
      type: "Task",
      priority: 3,
      mit: false,
      matter_id: entry.matter_id,
      project_id: entry.project_id,
    })
    .select("id")
    .single();
  if (tErr || !t) return { ok: false, error: tErr?.message ?? "Couldn't create task" };
  await sb
    .from("entries")
    .update({ kind: "task", status: "filed", task_id: (t as { id: string }).id })
    .eq("id", id);
  revalidate();
  return { ok: true, taskTitle: title };
}

export async function deleteEntry(id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb.from("entries").delete().eq("id", id);
  revalidate();
  return { ok: !error, error: error?.message };
}
