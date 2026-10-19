import "server-only";
import { getSupabase } from "@/lib/supabase";
import { TASK_COLUMNS, type TaskRowDB } from "@/lib/task-map";
import { nameMaps, resolveMatters, taskOut } from "@/lib/assistant-tools";
import { createTask, updateTask, type TaskPatch } from "@/app/(app)/task-actions";
import { captureEntry } from "@/app/(app)/entry-actions";
import { addNoteLink, addTagToNote } from "@/app/(app)/note-actions";

// ============================================================
// Changes Claude can make in AB HQ through the connector. Each one goes
// through the same code paths as the app's own screens (MIT cap, activity
// log, recurrence, capture routing), so nothing here bypasses the rules.
// ============================================================

type Domain = "Work" | "Personal";
type TaskType = "Task" | "Event" | "Deadline";
type WaitingOn = "Chris" | "Opposing Counsel" | "Court" | "Other";

/** A case name must resolve to exactly one matter before anything is written. */
async function oneMatter(name: string): Promise<{ id: string; name: string } | { error: string }> {
  const hits = await resolveMatters(name);
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) return { error: `No case matches "${name}".` };
  return { error: `"${name}" matches ${hits.length} cases: ${hits.map((h) => h.name).join("; ")}. Use the exact name.` };
}

async function projectId(name: string): Promise<string | { error: string }> {
  const q = name.trim().replace(/[%,()]/g, " ");
  const { data } = await getSupabase().from("projects").select("id,name").ilike("name", `%${q}%`).limit(5);
  const rows = (data ?? []) as { id: string; name: string }[];
  const exact = rows.find((r) => r.name.toLowerCase() === q.toLowerCase());
  if (exact) return exact.id;
  if (rows.length === 1) return rows[0].id;
  return { error: rows.length ? `"${name}" matches several projects: ${rows.map((r) => r.name).join("; ")}.` : `No project matches "${name}".` };
}

async function fetchTask(id: string) {
  const { data } = await getSupabase().from("tasks").select(TASK_COLUMNS).eq("id", id).maybeSingle();
  return data ? taskOut(data as unknown as TaskRowDB, await nameMaps()) : null;
}

// ---------------- add_tasks ----------------

export interface NewTask {
  title: string;
  type?: TaskType;
  priority?: number;
  date?: string;
  time?: string;
  estimateMin?: number;
  matter?: string;
  project?: string;
  domain?: Domain;
  notes?: string;
  mit?: boolean;
  waitingOn?: WaitingOn;
}

export async function addTasks(tasks: NewTask[]) {
  const created: unknown[] = [];
  const failed: { title: string; error: string }[] = [];
  for (const t of tasks) {
    const patch: TaskPatch & { title: string } = {
      title: t.title.trim(),
      type: t.type ?? "Task",
      priority: t.priority ?? 3,
      domain: t.domain ?? "Work",
      status: "To Do",
      doDate: t.date ?? null,
      doTime: t.time ?? null,
      durationMin: t.estimateMin ?? null,
      notes: t.notes ?? null,
      mit: t.mit ?? false,
      waitingOn: t.waitingOn ?? null,
    };
    if (t.matter) {
      const m = await oneMatter(t.matter);
      if ("error" in m) { failed.push({ title: t.title, error: m.error }); continue; }
      patch.matterId = m.id;
    }
    if (t.project) {
      const p = await projectId(t.project);
      if (typeof p !== "string") { failed.push({ title: t.title, error: p.error }); continue; }
      patch.projectId = p;
    }
    const r = await createTask(patch);
    if (!r.ok || !r.task) { failed.push({ title: t.title, error: r.error ?? "Couldn't save." }); continue; }
    created.push(await fetchTask(r.task.id));
    if (t.mit && !r.task.mit) failed.push({ title: t.title, error: "Saved, but not as a MIT: three are already set." });
  }
  return { created, ...(failed.length ? { problems: failed } : {}) };
}

// ---------------- update_task ----------------

export interface TaskChange {
  id: string;
  title?: string;
  status?: "Inbox" | "To Do" | "In Progress" | "Done" | "Someday" | "Cancelled";
  type?: TaskType;
  priority?: number;
  date?: string | null;
  time?: string | null;
  estimateMin?: number | null;
  mit?: boolean;
  matter?: string | null;
  project?: string | null;
  domain?: Domain;
  notes?: string | null;
  waitingOn?: WaitingOn | null;
}

export async function changeTask(c: TaskChange) {
  const before = await fetchTask(c.id);
  if (!before) return { error: "No task with that id. Find it with get_today, list_open_tasks, or get_case." };
  const patch: TaskPatch = {};
  if (c.title !== undefined) patch.title = c.title.trim();
  if (c.status !== undefined) patch.status = c.status;
  if (c.type !== undefined) patch.type = c.type;
  if (c.priority !== undefined) patch.priority = c.priority;
  if (c.date !== undefined) patch.doDate = c.date;
  if (c.time !== undefined) patch.doTime = c.time;
  if (c.estimateMin !== undefined) patch.durationMin = c.estimateMin;
  if (c.mit !== undefined) patch.mit = c.mit;
  if (c.domain !== undefined) patch.domain = c.domain;
  if (c.notes !== undefined) patch.notes = c.notes;
  if (c.waitingOn !== undefined) patch.waitingOn = c.waitingOn;
  if (c.matter !== undefined) {
    if (c.matter === null) patch.matterId = null;
    else {
      const m = await oneMatter(c.matter);
      if ("error" in m) return { error: m.error };
      patch.matterId = m.id;
    }
  }
  if (c.project !== undefined) {
    if (c.project === null) patch.projectId = null;
    else {
      const p = await projectId(c.project);
      if (typeof p !== "string") return { error: p.error };
      patch.projectId = p;
    }
  }
  const r = await updateTask(c.id, patch);
  if (!r.ok) return { error: r.error ?? "Couldn't save." };
  return { before, after: await fetchTask(c.id) };
}

// ---------------- capture ----------------

/** Exactly what ⌘K does: saved verbatim, routed to a case, tenths logged. */
export async function capture(text: string) {
  const r = await captureEntry(text);
  if (!r.ok) return { error: r.error ?? "Couldn't save." };
  return {
    saved: true,
    filedTo: r.routedTo ?? "unfiled (waiting in Quick Drop)",
    ...(r.madeTask ? { createdTask: r.madeTask } : {}),
    ...(r.label ? { summary: r.label } : {}),
  };
}

// ---------------- save_meeting ----------------

export interface MeetingInput {
  notionUrl: string;
  title: string;
  date: string;
  matter?: string;
  attendees?: string[];
  summary: string;
  keyPoints?: string[];
  decisions?: string[];
  actionItems?: string[];
}

/** The 32-hex Notion id at the end of a page/block URL. */
function notionId(url: string): string | null {
  const m = url.replace(/-/g, "").match(/([0-9a-f]{32})(?:[?#].*)?$/i);
  return m ? m[1].toLowerCase() : null;
}

/** The meeting's full record (Notion's notes and the transcript), straight from Notion. */
async function fetchNotionRecord(id: string): Promise<{ text: string } | { error: string }> {
  const token = process.env.NOTION_TOKEN;
  if (!token) return { error: "AB HQ's Notion connection isn't set up yet (NOTION_TOKEN)." };
  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${id}/markdown?include_transcript=true`, {
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2026-03-11" },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404 || res.status === 403) {
      return { error: "Notion wouldn't share this page. Make sure the Meeting Notes database is connected to the AB HQ integration." };
    }
    if (!res.ok) return { error: `Notion returned ${res.status}.` };
    const body = (await res.json()) as { markdown?: string; truncated?: boolean };
    return { text: (body.markdown ?? "") + (body.truncated ? "\n\n[Notion truncated this record; open the meeting in Notion for the rest.]" : "") };
  } catch {
    return { error: "Couldn't reach Notion." };
  }
}

type PMNode = Record<string, unknown>;
const txt = (t: string, marks?: PMNode[]): PMNode => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
const para = (...content: PMNode[]): PMNode => (content.length ? { type: "paragraph", content } : { type: "paragraph" });
const h2 = (t: string): PMNode => ({ type: "heading", attrs: { level: 2 }, content: [txt(t)] });
const bullets = (items: string[]): PMNode => ({
  type: "bulletList",
  content: items.map((i) => ({ type: "listItem", content: [para(txt(i))] })),
});
const checklist = (items: string[]): PMNode => ({
  type: "taskList",
  content: items.map((i) => ({ type: "taskItem", attrs: { checked: false }, content: [para(txt(i))] })),
});

/** Notion's enhanced markdown → readable plain lines (no tags, no footnote links). */
function cleanLines(md: string): string[] {
  return md
    .replace(/<mention-date start="([^"]+)"[^>]*\/>/g, "$1")
    .replace(/\[\^[^\]]*\]/g, "")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((l) => l.trim().replace(/^- \[ \] /, "☐ ").replace(/^- \[x\] /i, "☑ ").replace(/^[-*] /, "• "))
    .filter(Boolean);
}

function section(md: string, tag: string): string | null {
  const m = md.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

/**
 * The meeting's full record inside a collapsed toggle: Notion's summary,
 * Andy's own notes, then the conversation. Headings become bold lines.
 */
function recordToggle(label: string, markdown: string): PMNode {
  const parts: [string, string | null][] = [
    ["Notion's summary", section(markdown, "summary")],
    ["Your notes", section(markdown, "notes")],
    ["Conversation", section(markdown, "transcript")],
  ];
  const known = parts.some(([, body]) => body !== null);
  const content: PMNode[] = [];
  for (const [title, body] of known ? parts : [["Record", markdown] as [string, string]]) {
    const lines = body ? cleanLines(body) : [];
    if (!lines.length) continue;
    content.push(para(txt(title.toUpperCase(), [{ type: "bold" }])));
    for (const l of lines) {
      const heading = l.match(/^#{1,6}\s+(.*)/);
      content.push(heading ? para(txt(heading[1], [{ type: "bold" }])) : para(txt(l)));
    }
  }
  return {
    type: "details",
    attrs: { open: false },
    content: [
      { type: "detailsSummary", content: [txt(label)] },
      { type: "detailsContent", content: content.length ? content : [para()] },
    ],
  };
}

function plainText(n: PMNode): string {
  if (n.type === "text") return String(n.text ?? "");
  const kids = (n.content as PMNode[] | undefined) ?? [];
  const inner = kids.map(plainText).join(n.type === "paragraph" || n.type === "heading" ? "" : "\n");
  return n.type === "paragraph" || n.type === "heading" ? inner + "\n" : inner;
}

export async function saveMeeting(m: MeetingInput) {
  const id = notionId(m.notionUrl);
  if (!id) return { error: "That doesn't look like a Notion page link." };
  const source = `https://app.notion.com/p/${id}`;

  let matter: { id: string; name: string } | null = null;
  if (m.matter) {
    const r = await oneMatter(m.matter);
    if ("error" in r) return { error: r.error };
    matter = r;
  }

  const record = await fetchNotionRecord(id);
  const content: PMNode[] = [
    para(txt("Imported from Notion, which keeps the original. Source: ", [{ type: "italic" }]), txt(source, [{ type: "link", attrs: { href: source } }])),
    h2("Summary"),
    ...m.summary.split(/\n{2,}/).map((p) => para(txt(p.trim()))),
  ];
  if (m.decisions?.length) content.push(h2("Decisions"), bullets(m.decisions));
  if (m.actionItems?.length) content.push(h2("Action items"), checklist(m.actionItems));
  if (m.keyPoints?.length) content.push(h2("Key points"), bullets(m.keyPoints));
  if (m.attendees?.length) content.push(h2("Attendees"), para(txt(m.attendees.join(", "))));
  if ("text" in record) content.push(recordToggle("The full meeting record from Notion (summary, notes, and conversation)", record.text));
  else content.push(para(txt(`Conversation not attached: ${record.error}`, [{ type: "italic" }])));

  const doc = { type: "doc", content };
  const row = {
    title: `${m.date} · ${m.title}`,
    body: plainText(doc).trim(),
    body_json: doc,
    domain: "Work",
    updated_at: new Date().toISOString(),
  };

  const sb = getSupabase();
  // One note per Notion meeting: re-importing refreshes it.
  const { data: existing } = await sb.from("notes").select("id").ilike("body", `%${id}%`).limit(1).maybeSingle();
  let noteId: string;
  if (existing) {
    noteId = (existing as { id: string }).id;
    const { error } = await sb.from("notes").update(row).eq("id", noteId);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await sb.from("notes").insert({ ...row, status: "Active" }).select("id").single();
    if (error || !data) return { error: error?.message ?? "Couldn't save the note." };
    noteId = (data as { id: string }).id;
  }
  await addTagToNote(noteId, "meeting"); // no-op error if already tagged
  if (matter) await addNoteLink(noteId, "matter", matter.id); // no-op error if already linked

  return {
    saved: existing ? "updated the existing meeting note" : "created a meeting note",
    noteId,
    title: row.title,
    case: matter?.name ?? null,
    conversation: "text" in record ? `attached (${record.text.length.toLocaleString()} characters)` : record.error,
  };
}
