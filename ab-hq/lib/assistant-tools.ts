import "server-only";
import { getSupabase } from "@/lib/supabase";
import { getCasesPageData } from "@/lib/queries";
import { TASK_COLUMNS, todayISO, formatTime, type TaskRowDB } from "@/lib/task-map";

// ============================================================
// Read-only lookups Claude can call to answer questions about AB HQ.
// Shared by the Claude connector (app/api/mcp) and, later, the in-app
// chat. Each returns plain JSON shaped for a model to read: names
// instead of ids, P1–P4 instead of numbers, times as "9:30A".
// ============================================================

export interface TaskOut {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  date?: string;
  time?: string;
  matter?: string;
  project?: string;
  mit?: true;
  waitingOn?: string;
  estimateMin?: number;
}

const OPEN_STATUSES = '("Done","Cancelled","Someday")';

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function nameMaps() {
  const sb = getSupabase();
  const [m, p] = await Promise.all([
    sb.from("matters").select("id,name"),
    sb.from("projects").select("id,name"),
  ]);
  const matters = new Map((m.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));
  const projects = new Map((p.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));
  return { matters, projects };
}

export function taskOut(t: TaskRowDB, maps: Awaited<ReturnType<typeof nameMaps>>): TaskOut {
  return {
    id: t.id,
    title: t.title,
    type: t.type,
    priority: `P${t.priority}`,
    status: t.status,
    ...(t.do_date ? { date: t.do_date } : {}),
    ...(t.do_time ? { time: formatTime(t.do_time) } : {}),
    ...(t.matter_id && maps.matters.get(t.matter_id) ? { matter: maps.matters.get(t.matter_id) } : {}),
    ...(t.project_id && maps.projects.get(t.project_id) ? { project: maps.projects.get(t.project_id) } : {}),
    ...(t.mit ? { mit: true as const } : {}),
    ...(t.waiting_on ? { waitingOn: t.waiting_on } : {}),
    ...(t.duration_min ? { estimateMin: t.duration_min } : {}),
  };
}

function byDateThenPriority(a: TaskRowDB, b: TaskRowDB): number {
  const da = a.do_date ?? "9999-12-31";
  const db = b.do_date ?? "9999-12-31";
  if (da !== db) return da < db ? -1 : 1;
  if ((a.do_time ?? "") !== (b.do_time ?? "")) return (a.do_time ?? "99") < (b.do_time ?? "99") ? -1 : 1;
  return a.priority - b.priority;
}

/** Find matters by name, client, or case number. Exact name match wins. */
export async function resolveMatters(query: string): Promise<{ id: string; name: string; client: string | null }[]> {
  const q = query.trim().replace(/[%,()]/g, " ");
  const { data } = await getSupabase()
    .from("matters")
    .select("id,name,client")
    .or(`name.ilike.%${q}%,client.ilike.%${q}%,case_number.ilike.%${q}%`)
    .limit(10);
  const rows = (data ?? []) as { id: string; name: string; client: string | null }[];
  const exact = rows.find((r) => r.name.toLowerCase() === q.toLowerCase());
  return exact ? [exact] : rows;
}

// ---------------- get_today ----------------

export async function getToday() {
  const sb = getSupabase();
  const today = todayISO();
  const [tasksRes, maps, daily, yesterday, timer] = await Promise.all([
    sb
      .from("tasks")
      .select(TASK_COLUMNS)
      .not("status", "in", OPEN_STATUSES)
      .or(`do_date.lte.${today},mit.eq.true,status.eq."In Progress"`),
    nameMaps(),
    sb.from("daily_entries").select("intention").eq("date", today).maybeSingle(),
    sb.from("daily_entries").select("on_tap_for_tomorrow").eq("date", addDays(today, -1)).maybeSingle(),
    sb.from("time_sessions").select("task_id,started_at").is("ended_at", null).maybeSingle(),
  ]);
  if (tasksRes.error) throw new Error(tasksRes.error.message);
  const tasks = (tasksRes.data as unknown as TaskRowDB[]).sort(byDateThenPriority);
  const out = (t: TaskRowDB) => taskOut(t, maps);

  const isScheduled = (t: TaskRowDB) => t.type === "Event" && t.do_date === today && !!t.do_time;
  let runningTimer: { task: string; startedAt: string } | null = null;
  if (timer.data) {
    const { data: tt } = await sb.from("tasks").select("title").eq("id", timer.data.task_id).maybeSingle();
    runningTimer = { task: tt?.title ?? "(unknown task)", startedAt: timer.data.started_at };
  }

  return {
    date: today,
    weekday: new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    intention: daily.data?.intention ?? null,
    onTapFromYesterday: yesterday.data?.on_tap_for_tomorrow ?? null,
    mits: tasks.filter((t) => t.mit).map(out),
    schedule: tasks.filter(isScheduled).map(out),
    dueToday: tasks.filter((t) => !t.mit && !isScheduled(t) && t.do_date === today).map(out),
    overdue: tasks.filter((t) => !t.mit && t.do_date !== null && t.do_date < today).map(out),
    inProgressUndated: tasks
      .filter((t) => !t.mit && t.status === "In Progress" && (!t.do_date || t.do_date > today))
      .map(out),
    runningTimer,
  };
}

// ---------------- list_open_tasks ----------------

export async function listOpenTasks(opts: {
  matter?: string;
  dueWithinDays?: number;
  maxPriority?: number;
  domain?: "Work" | "Personal";
  type?: "Task" | "Event" | "Deadline";
  includeSomeday?: boolean;
  limit?: number;
}) {
  const sb = getSupabase();
  const today = todayISO();
  let q = sb
    .from("tasks")
    .select(TASK_COLUMNS)
    .not("status", "in", opts.includeSomeday ? '("Done","Cancelled")' : OPEN_STATUSES);

  let matterNote: string | undefined;
  if (opts.matter) {
    const hits = await resolveMatters(opts.matter);
    if (hits.length === 0) return { error: `No case matches "${opts.matter}".` };
    q = q.in("matter_id", hits.map((h) => h.id));
    if (hits.length > 1) matterNote = `Matched ${hits.length} cases: ${hits.map((h) => h.name).join("; ")}`;
  }
  if (opts.dueWithinDays !== undefined) q = q.lte("do_date", addDays(today, opts.dueWithinDays));
  if (opts.maxPriority) q = q.lte("priority", opts.maxPriority);
  if (opts.domain) q = q.eq("domain", opts.domain);
  if (opts.type) q = q.eq("type", opts.type);

  const [res, maps] = await Promise.all([q, nameMaps()]);
  if (res.error) throw new Error(res.error.message);
  const rows = (res.data as unknown as TaskRowDB[]).sort(byDateThenPriority);
  const limit = Math.min(opts.limit ?? 50, 200);
  return {
    today,
    ...(matterNote ? { note: matterNote } : {}),
    total: rows.length,
    tasks: rows.slice(0, limit).map((t) => taskOut(t, maps)),
    ...(rows.length > limit ? { truncated: `${rows.length - limit} more not shown` } : {}),
  };
}

// ---------------- list_cases ----------------

export async function listCases(opts: { query?: string; includeClosed?: boolean }) {
  const { cases, today } = await getCasesPageData();
  const q = opts.query?.trim().toLowerCase();
  const rows = cases
    .filter((c) => opts.includeClosed || !c.disposition)
    .filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.client.toLowerCase().includes(q) ||
        (c.caseNumber ?? "").toLowerCase().includes(q)
    )
    .sort((a, b) => (a.nextDeadline ?? "9999") < (b.nextDeadline ?? "9999") ? -1 : 1);
  return {
    today,
    total: rows.length,
    cases: rows.map((c) => ({
      name: c.name,
      client: c.client || undefined,
      stage: c.stage || undefined,
      status: c.status || undefined,
      caseNumber: c.caseNumber ?? undefined,
      court: c.court ?? undefined,
      closed: c.disposition ? `Closed: ${c.disposition}` : undefined,
      nextDeadline: c.nextDeadline ?? undefined,
      nextDeadlineWhat: c.deadlineTitle ?? undefined,
      openTasks: c.openCount,
      overdueTasks: c.overdueCount,
    })),
  };
}

// ---------------- get_case ----------------

export async function getCase(opts: { name: string }) {
  const hits = await resolveMatters(opts.name);
  if (hits.length === 0) return { error: `No case matches "${opts.name}". Try list_cases.` };
  if (hits.length > 1) {
    return { ambiguous: true, candidates: hits.map((h) => ({ name: h.name, client: h.client })) };
  }
  const id = hits[0].id;
  const sb = getSupabase();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [matter, open, done, entries, links, people, projects, maps] = await Promise.all([
    sb.from("matters").select("*").eq("id", id).single(),
    sb.from("tasks").select(TASK_COLUMNS).eq("matter_id", id).not("status", "in", '("Done","Cancelled")'),
    sb.from("tasks").select(TASK_COLUMNS).eq("matter_id", id).eq("status", "Done").gte("completed_at", since),
    sb
      .from("entries")
      .select("raw,summary,kind,billed_tenths,created_at")
      .eq("matter_id", id)
      .neq("status", "dismissed")
      .order("created_at", { ascending: false })
      .limit(25),
    sb.from("note_links").select("notes(id,title,body,updated_at)").eq("target_type", "matter").eq("target_id", id),
    sb.from("matter_people").select("role,people(name,org,email,phone)").eq("matter_id", id),
    sb.from("projects").select("name,deadline,status").eq("matter_id", id),
    nameMaps(),
  ]);
  if (matter.error) throw new Error(matter.error.message);
  const m = matter.data as Record<string, unknown>;
  const pick = (k: string) => (m[k] === null || m[k] === undefined || m[k] === "" ? undefined : m[k]);

  type NoteJoin = { notes: { id: string; title: string | null; body: string | null; updated_at: string } | null };
  type PersonJoin = { role: string; people: { name: string; org: string | null; email: string | null; phone: string | null } | null };

  return {
    case: {
      name: m.name,
      client: pick("client"),
      stage: pick("stage"),
      status: pick("status"),
      caseNumber: pick("case_number"),
      court: pick("court"),
      judge: pick("judge"),
      nextDeadline: pick("next_deadline"),
      disposition: pick("disposition"),
      closedAt: pick("closed_at"),
    },
    openTasks: ((open.data ?? []) as unknown as TaskRowDB[]).sort(byDateThenPriority).map((t) => taskOut(t, maps)),
    doneLast30Days: ((done.data ?? []) as unknown as TaskRowDB[]).map((t) => ({
      title: t.title,
      completed: t.completed_at?.slice(0, 10),
    })),
    projects: projects.data ?? [],
    people: ((people.data ?? []) as unknown as PersonJoin[])
      .filter((p) => p.people)
      .map((p) => ({ role: p.role, ...p.people! })),
    recentCaptures: (entries.data ?? []).map(
      (e: { raw: string; summary: string | null; kind: string; billed_tenths: number | null; created_at: string }) => ({
        when: e.created_at.slice(0, 10),
        kind: e.kind,
        text: e.raw,
        ...(e.billed_tenths ? { billed: `(.${e.billed_tenths})` } : {}),
      })
    ),
    notes: ((links.data ?? []) as unknown as NoteJoin[])
      .filter((l) => l.notes)
      .map((l) => ({
        id: l.notes!.id,
        title: l.notes!.title ?? firstLine(l.notes!.body),
        updated: l.notes!.updated_at.slice(0, 10),
        preview: (l.notes!.body ?? "").replace(/\s+/g, " ").trim().slice(0, 240),
      })),
  };
}

function firstLine(body: string | null): string {
  return (body ?? "").trim().split("\n")[0]?.slice(0, 60) || "(untitled)";
}

// ---------------- search_notes / get_note ----------------

export async function searchNotes(opts: { query: string; limit?: number; includeArchived?: boolean }) {
  const terms = opts.query.toLowerCase().split(/\s+/).filter(Boolean);
  let q = getSupabase().from("notes").select("id,title,body,status,updated_at");
  if (!opts.includeArchived) q = q.neq("status", "Archived");
  const { data, error } = await q.order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  const hits = ((data ?? []) as { id: string; title: string | null; body: string | null; status: string; updated_at: string }[])
    .filter((n) => {
      const hay = `${n.title ?? ""} ${n.body ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .slice(0, Math.min(opts.limit ?? 10, 50));
  return {
    total: hits.length,
    notes: hits.map((n) => {
      const body = (n.body ?? "").replace(/\s+/g, " ").trim();
      const at = terms.length ? Math.max(0, body.toLowerCase().indexOf(terms[0]) - 80) : 0;
      return {
        id: n.id,
        title: n.title ?? firstLine(n.body),
        status: n.status,
        updated: n.updated_at.slice(0, 10),
        snippet: (at > 0 ? "…" : "") + body.slice(at, at + 280),
      };
    }),
  };
}

export async function getNote(opts: { id: string }) {
  const sb = getSupabase();
  const [note, tags, links] = await Promise.all([
    sb.from("notes").select("id,title,body,status,pinned,created_at,updated_at").eq("id", opts.id).maybeSingle(),
    sb.from("note_tags").select("tags(name)").eq("note_id", opts.id),
    sb.from("note_links").select("target_type,target_id").eq("note_id", opts.id),
  ]);
  if (!note.data) return { error: "No note with that id. Use search_notes to find one." };
  const maps = await nameMaps();
  type TagJoin = { tags: { name: string } | null };
  return {
    title: note.data.title ?? firstLine(note.data.body),
    status: note.data.status,
    pinned: note.data.pinned,
    created: note.data.created_at.slice(0, 10),
    updated: note.data.updated_at.slice(0, 10),
    tags: ((tags.data ?? []) as unknown as TagJoin[]).map((t) => t.tags?.name).filter(Boolean),
    linkedCases: (links.data ?? [])
      .filter((l: { target_type: string }) => l.target_type === "matter")
      .map((l: { target_id: string }) => maps.matters.get(l.target_id))
      .filter(Boolean),
    text: note.data.body ?? "",
  };
}
