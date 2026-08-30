"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import type { Entry, EntryKind } from "@/lib/data";
import { routeEntry, hasRoutingKey } from "@/lib/route-entry";
import { todayISO } from "@/lib/task-map";
import {
  ENTRY_COLUMNS,
  ENTRY_COLUMNS_LEGACY,
  rowToEntry as toEntry,
  splitBillingLine,
  type EntryRowDB,
} from "@/lib/entry-map";

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
  label?: string; // precomputed outcome line (used for multi-segment captures)
}

interface RoutingContext {
  matters: { id: string; name: string; client: string | null }[];
  projects: { id: string; name: string }[];
}

async function captureOne(
  text: string,
  tenths: number | null,
  ctx: RoutingContext
): Promise<CaptureResult> {
  const sb = getSupabase();

  const insertRow: Record<string, unknown> = { raw: text };
  if (tenths) insertRow.billed_tenths = tenths;
  let { data: inserted, error: insErr } = await sb
    .from("entries")
    .insert(insertRow)
    .select(ENTRY_COLUMNS)
    .single();
  if (insErr && tenths) {
    // Pre-0013 — retry without the tenths column, legacy select.
    delete insertRow.billed_tenths;
    ({ data: inserted, error: insErr } = await sb
      .from("entries")
      .insert(insertRow)
      .select(ENTRY_COLUMNS_LEGACY)
      .single());
  }
  if (insErr || !inserted) {
    const hint = insErr?.message?.includes("entries")
      ? "The entries table doesn't exist yet — run migration 0012 in Supabase."
      : insErr?.message;
    return { ok: false, error: hint ?? "Couldn't save." };
  }
  const entry = toEntry(inserted as EntryRowDB);

  const route = await routeEntry(text, todayISO(), ctx.matters, ctx.projects);
  if (!route) {
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
      domain: route.domain,
      type: route.taskType ?? (route.kind === "event" ? "Event" : "Task"),
      priority: route.priority ?? 3,
      mit: false,
      do_date: route.doDate,
      do_time: route.doTime,
      duration_min: route.durationMin,
      matter_id: route.matterId,
      project_id: route.projectId,
    };
    if (route.waitingOn) taskRow.waiting_on = route.waitingOn;
    if (route.recur) taskRow.recur = route.recur;
    let { data: t, error: tErr } = await sb.from("tasks").insert(taskRow).select("id").single();
    if (tErr && (route.waitingOn || route.recur)) {
      // Pre-0012/0014 tasks table — retry without the newer columns.
      delete taskRow.waiting_on;
      delete taskRow.recur;
      ({ data: t, error: tErr } = await sb.from("tasks").insert(taskRow).select("id").single());
    }
    if (!tErr && t) {
      taskId = (t as { id: string }).id;
      // Toast shows what got scheduled, so misreads are caught immediately.
      const bits: string[] = [route.title];
      if (route.doDate) {
        const [, m, d] = route.doDate.split("-").map(Number);
        const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        let when = `${MO[m - 1]} ${d}`;
        if (route.doTime) {
          const [h, min] = route.doTime.split(":").map(Number);
          const ap = h >= 12 ? "p" : "a";
          const h12 = h % 12 === 0 ? 12 : h % 12;
          when += ` ${h12}${min ? `:${String(min).padStart(2, "0")}` : ""}${ap}`;
        }
        bits.push(when);
      }
      if ((route.taskType ?? "") === "Deadline") bits.push("DEADLINE");
      if (route.recur) bits.push("↻ recurring");
      madeTask = bits.join(" · ");
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

  const matterName = route.matterId
    ? ctx.matters.find((m) => m.id === route.matterId)?.name ?? null
    : null;
  return {
    ok: true,
    entry: updated ? toEntry(updated as EntryRowDB) : entry,
    routedTo: matterName,
    madeTask,
  };
}

/**
 * The one box. Saves the raw text immediately (capture never loses anything),
 * then routes it. A pasted billing line — "reviewed redlines (.4); emails with
 * CoCo re same (.2); …" — is split into one entry per activity, each with its
 * billed tenths, each routed on its own.
 */
export async function captureEntry(raw: string): Promise<CaptureResult> {
  const clean = raw.trim();
  if (!clean) return { ok: false, error: "Empty entry." };
  const sb = getSupabase();

  // Fetch routing context once (open matters + active projects).
  const [mattersRes, projectsRes] = await Promise.all([
    sb.from("matters").select("id,name,client,status,disposition"),
    sb.from("projects").select("id,name,status"),
  ]);
  const ctx: RoutingContext = {
    matters: ((mattersRes.data ?? []) as {
      id: string;
      name: string;
      client: string | null;
      status: string | null;
      disposition: string | null;
    }[]).filter((m) => m.status !== "Closed" && !m.disposition),
    projects: ((projectsRes.data ?? []) as { id: string; name: string; status: string }[]).filter(
      (p) => p.status === "Active"
    ),
  };

  const segments = splitBillingLine(clean);
  if (segments.length === 1) {
    const r = await captureOne(segments[0].text, segments[0].tenths, ctx);
    if (r.ok && segments[0].tenths) {
      r.label = [
        `.${segments[0].tenths} logged`,
        r.routedTo ? `filed to ${r.routedTo}` : "unfiled — in Quick Drop",
      ].join(" · ");
    }
    revalidate();
    return r;
  }

  const results = await Promise.all(segments.map((s) => captureOne(s.text, s.tenths, ctx)));
  revalidate();
  const okCount = results.filter((r) => r.ok).length;
  const totalTenths = segments.reduce((a, s) => a + (s.tenths ?? 0), 0);
  const matterNames = [...new Set(results.map((r) => r.routedTo).filter(Boolean))] as string[];
  const unfiled = results.filter((r) => r.ok && !r.routedTo).length;
  const bits = [`${okCount} entries`, `${(totalTenths / 10).toFixed(1)}h logged`];
  if (matterNames.length) bits.push(`filed to ${matterNames.join(", ")}`);
  if (unfiled) bits.push(`${unfiled} unfiled`);
  return {
    ok: okCount > 0,
    error: okCount === 0 ? results[0]?.error : undefined,
    entry: results.find((r) => r.entry)?.entry,
    routedTo: matterNames[0] ?? null,
    madeTask: null,
    label: bits.join(" · "),
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
