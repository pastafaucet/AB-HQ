import "server-only";
import { getSupabase } from "@/lib/supabase";
import type { Task, Matter, RunningTimer } from "@/lib/data";
import {
  TASK_COLUMNS,
  todayISO,
  rowToTask,
  rowToMatter,
  type TaskRowDB,
  type MatterRowDB,
} from "@/lib/task-map";

export interface MyDayData {
  tasks: Task[]; // all tasks relevant to today (mits ∪ also-today ∪ in-progress)
  matters: Matter[];
  today: string;
  running: RunningTimer | null;
  logged: Record<string, number>; // taskId → completed seconds tracked
}

export interface CaseRow {
  id: string;
  name: string;
  client: string;
  stage: string;
  status: string;
  caseNumber: string | null;
  court: string | null;
  disposition: string | null;
  nextDeadline: string | null; // YYYY-MM-DD; may be in the past (overdue)
  deadlineTitle: string | null; // the deadline task it came from, if any
  openCount: number;
  overdueCount: number;
}

/** Every matter with task rollups — the Cases hub list. */
export async function getCasesPageData(): Promise<{ cases: CaseRow[]; today: string }> {
  const sb = getSupabase();
  const today = todayISO();

  let [mattersRes, tasksRes] = await Promise.all([
    sb
      .from("matters")
      .select("id,name,client,stage,status,next_deadline,case_number,court,disposition"),
    sb
      .from("tasks")
      .select("matter_id,status,type,do_date,title")
      .neq("status", "Cancelled")
      .neq("status", "Done")
      .not("matter_id", "is", null),
  ]);
  if (mattersRes.error) {
    // Migration 0008 (disposition column) not applied yet — degrade gracefully.
    const retry = await sb
      .from("matters")
      .select("id,name,client,stage,status,next_deadline,case_number,court");
    mattersRes = retry as typeof mattersRes;
  }
  if (mattersRes.error) throw mattersRes.error;
  if (tasksRes.error) throw tasksRes.error;

  const byMatter = new Map<
    string,
    { open: number; overdue: number; dl: string | null; dlTitle: string | null }
  >();
  for (const t of tasksRes.data as {
    matter_id: string;
    status: string;
    type: string;
    do_date: string | null;
    title: string;
  }[]) {
    const agg = byMatter.get(t.matter_id) ?? { open: 0, overdue: 0, dl: null, dlTitle: null };
    if (t.status !== "Someday") {
      agg.open += 1;
      if (t.do_date && t.do_date < today) agg.overdue += 1;
      if (t.type === "Deadline" && t.do_date && (!agg.dl || t.do_date < agg.dl)) {
        agg.dl = t.do_date;
        agg.dlTitle = t.title;
      }
    }
    byMatter.set(t.matter_id, agg);
  }

  type MatterFull = MatterRowDB & {
    stage: string | null;
    case_number: string | null;
    court: string | null;
    disposition: string | null;
  };
  const cases: CaseRow[] = (mattersRes.data as MatterFull[]).map((m) => {
    const agg = byMatter.get(m.id) ?? { open: 0, overdue: 0, dl: null, dlTitle: null };
    // Soonest of the matter's own next_deadline and its open deadline tasks.
    let nextDeadline = agg.dl;
    let deadlineTitle = agg.dlTitle;
    if (m.next_deadline && (!nextDeadline || m.next_deadline < nextDeadline)) {
      nextDeadline = m.next_deadline;
      deadlineTitle = null;
    }
    return {
      id: m.id,
      name: m.name,
      client: m.client ?? "",
      stage: m.stage ?? "",
      status: m.status ?? "",
      caseNumber: m.case_number ?? null,
      court: m.court ?? null,
      disposition: m.disposition ?? null,
      nextDeadline,
      deadlineTitle,
      openCount: agg.open,
      overdueCount: agg.overdue,
    };
  });

  return { cases, today };
}

export interface PersonCaseLink {
  linkId: string;
  matterId: string;
  matterName: string;
  role: string;
  closed: boolean;
}

export interface PersonRow {
  id: string;
  name: string;
  org: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  links: PersonCaseLink[];
}

export interface MatterOption {
  id: string;
  name: string;
  closed: boolean;
}

/** Everyone in the system, with the cases they appear on — the People hub. */
export async function getPeoplePageData(): Promise<{
  people: PersonRow[];
  matters: MatterOption[];
}> {
  const sb = getSupabase();
  const [peopleRes, linksRes, mattersRes] = await Promise.all([
    sb.from("people").select("id,name,org,email,phone,notes").order("name"),
    sb.from("matter_people").select("id,person_id,matter_id,role"),
    sb.from("matters").select("id,name,status,disposition"),
  ]);
  if (peopleRes.error) throw peopleRes.error;
  if (linksRes.error) throw linksRes.error;
  if (mattersRes.error) throw mattersRes.error;

  const matterById = new Map(
    (mattersRes.data as { id: string; name: string; status: string | null; disposition: string | null }[]).map(
      (m) => [m.id, { name: m.name, closed: m.status === "Closed" || !!m.disposition }]
    )
  );
  const matters: MatterOption[] = (mattersRes.data as { id: string; name: string }[])
    .map((m) => ({ id: m.id, name: m.name, closed: matterById.get(m.id)!.closed }))
    .sort((a, b) => Number(a.closed) - Number(b.closed) || a.name.localeCompare(b.name));

  const linksByPerson = new Map<string, PersonCaseLink[]>();
  for (const l of linksRes.data as {
    id: string;
    person_id: string;
    matter_id: string;
    role: string;
  }[]) {
    const m = matterById.get(l.matter_id);
    if (!m) continue;
    const arr = linksByPerson.get(l.person_id) ?? [];
    arr.push({
      linkId: l.id,
      matterId: l.matter_id,
      matterName: m.name,
      role: l.role,
      closed: m.closed,
    });
    linksByPerson.set(l.person_id, arr);
  }

  const people: PersonRow[] = (peopleRes.data as Omit<PersonRow, "links">[]).map((p) => ({
    ...p,
    links: linksByPerson.get(p.id) ?? [],
  }));

  return { people, matters };
}

export interface NoteLinkInfo {
  linkId: string;
  type: "matter" | "task" | "person";
  id: string;
  label: string;
}

export interface NoteTagInfo {
  noteTagId: string;
  tagId: string;
  name: string;
}

export interface NoteDoc {
  id: string;
  title: string | null;
  bodyText: string;
  bodyJson: unknown | null;
  pinned: boolean;
  status: "Inbox" | "Active" | "Archived";
  createdAt: string;
  updatedAt: string;
  links: NoteLinkInfo[];
  tags: NoteTagInfo[];
}

export interface NotesPageData {
  notes: NoteDoc[];
  matters: MatterOption[];
  people: { id: string; name: string; org: string | null }[];
  tasks: { id: string; title: string }[];
  allTags: { id: string; name: string; count: number }[];
}

/** Everything the Notes hub needs: all notes + link labels + pickers. */
export async function getNotesPageData(): Promise<NotesPageData> {
  const sb = getSupabase();
  const [notesRes, linksRes, mattersRes, peopleRes, tasksRes, tagsRes, noteTagsRes] =
    await Promise.all([
      sb
        .from("notes")
        .select("id,title,body,body_json,pinned,status,created_at,updated_at")
        .order("created_at", { ascending: false }),
      sb.from("note_links").select("id,note_id,target_type,target_id"),
      sb.from("matters").select("id,name,status,disposition"),
      sb.from("people").select("id,name,org").order("name"),
      sb.from("tasks").select("id,title").neq("status", "Cancelled").order("created_at", { ascending: false }),
      sb.from("tags").select("id,name").order("name"),
      sb.from("note_tags").select("id,note_id,tag_id"),
    ]);
  if (notesRes.error) throw notesRes.error;
  if (linksRes.error) throw linksRes.error;
  if (mattersRes.error) throw mattersRes.error;
  if (peopleRes.error) throw peopleRes.error;
  if (tasksRes.error) throw tasksRes.error;
  // Tag tables may predate migration 0010 — degrade to no tags.
  const tagRows = tagsRes.error ? [] : (tagsRes.data as { id: string; name: string }[]);
  const noteTagRows = noteTagsRes.error
    ? []
    : (noteTagsRes.data as { id: string; note_id: string; tag_id: string }[]);

  const matterRows = mattersRes.data as {
    id: string;
    name: string;
    status: string | null;
    disposition: string | null;
  }[];
  const labelFor = new Map<string, string>();
  for (const m of matterRows) labelFor.set(`matter:${m.id}`, m.name);
  for (const p of peopleRes.data as { id: string; name: string }[])
    labelFor.set(`person:${p.id}`, p.name);
  for (const t of tasksRes.data as { id: string; title: string }[])
    labelFor.set(`task:${t.id}`, t.title);

  const linksByNote = new Map<string, NoteLinkInfo[]>();
  for (const l of linksRes.data as {
    id: string;
    note_id: string;
    target_type: "matter" | "task" | "person";
    target_id: string;
  }[]) {
    const arr = linksByNote.get(l.note_id) ?? [];
    arr.push({
      linkId: l.id,
      type: l.target_type,
      id: l.target_id,
      label: labelFor.get(`${l.target_type}:${l.target_id}`) ?? "—",
    });
    linksByNote.set(l.note_id, arr);
  }

  const tagNameById = new Map(tagRows.map((t) => [t.id, t.name]));
  const tagsByNote = new Map<string, NoteTagInfo[]>();
  const tagCounts = new Map<string, number>();
  for (const nt of noteTagRows) {
    const name = tagNameById.get(nt.tag_id);
    if (!name) continue;
    const arr = tagsByNote.get(nt.note_id) ?? [];
    arr.push({ noteTagId: nt.id, tagId: nt.tag_id, name });
    tagsByNote.set(nt.note_id, arr);
    tagCounts.set(nt.tag_id, (tagCounts.get(nt.tag_id) ?? 0) + 1);
  }

  const notes: NoteDoc[] = (notesRes.data as {
    id: string;
    title: string | null;
    body: string | null;
    body_json: unknown | null;
    pinned: boolean;
    status: string | null;
    created_at: string;
    updated_at: string;
  }[]).map((n) => ({
    id: n.id,
    title: n.title,
    bodyText: n.body ?? "",
    bodyJson: n.body_json,
    pinned: n.pinned,
    status: (n.status === "Inbox" || n.status === "Archived" ? n.status : "Active") as NoteDoc["status"],
    createdAt: n.created_at,
    updatedAt: n.updated_at,
    links: linksByNote.get(n.id) ?? [],
    tags: tagsByNote.get(n.id) ?? [],
  }));

  const matters: MatterOption[] = matterRows
    .map((m) => ({ id: m.id, name: m.name, closed: m.status === "Closed" || !!m.disposition }))
    .sort((a, b) => Number(a.closed) - Number(b.closed) || a.name.localeCompare(b.name));

  return {
    notes,
    matters,
    people: peopleRes.data as NotesPageData["people"],
    tasks: tasksRes.data as NotesPageData["tasks"],
    allTags: tagRows.map((t) => ({ id: t.id, name: t.name, count: tagCounts.get(t.id) ?? 0 })),
  };
}

export interface TasksPageData {
  tasks: Task[]; // every open task (not Done, not Cancelled)
  matters: Matter[];
  today: string;
  running: RunningTimer | null;
}

/** All open tasks for the Tasks hub — the full audit view. */
export async function getTasksPageData(): Promise<TasksPageData> {
  const sb = getSupabase();
  const today = todayISO();

  const [tasksRes, mattersRes, runRes] = await Promise.all([
    sb
      .from("tasks")
      .select(TASK_COLUMNS)
      .neq("status", "Cancelled")
      .neq("status", "Done")
      .order("created_at", { ascending: true }),
    sb.from("matters").select("id,name,client,status,next_deadline"),
    sb
      .from("time_sessions")
      .select("id,task_id,started_at")
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (tasksRes.error) throw tasksRes.error;
  if (mattersRes.error) throw mattersRes.error;

  const running: RunningTimer | null = runRes.data
    ? {
        sessionId: runRes.data.id as string,
        taskId: runRes.data.task_id as string,
        startedAt: runRes.data.started_at as string,
      }
    : null;

  return {
    tasks: (tasksRes.data as TaskRowDB[]).map((r) => rowToTask(r, today)),
    matters: (mattersRes.data as MatterRowDB[]).map((r) => rowToMatter(r, today)),
    today,
    running,
  };
}

/** All data the My Day (Today) surface needs, for the current calendar day. */
export async function getMyDayData(): Promise<MyDayData> {
  const sb = getSupabase();
  const today = todayISO();

  const [tasksRes, mattersRes, runRes] = await Promise.all([
    sb
      .from("tasks")
      .select(TASK_COLUMNS)
      .neq("status", "Cancelled")
      .order("created_at", { ascending: true }),
    sb.from("matters").select("id,name,client,status,next_deadline"),
    sb
      .from("time_sessions")
      .select("id,task_id,started_at")
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (tasksRes.error) throw tasksRes.error;
  if (mattersRes.error) throw mattersRes.error;

  const running: RunningTimer | null = runRes.data
    ? {
        sessionId: runRes.data.id as string,
        taskId: runRes.data.task_id as string,
        startedAt: runRes.data.started_at as string,
      }
    : null;

  const all = (tasksRes.data as TaskRowDB[]).map((r) => rowToTask(r, today));
  const matters = (mattersRes.data as MatterRowDB[]).map((r) => rowToMatter(r, today));

  // Only the tasks that belong on My Day: protected MITs, anything in
  // progress, and anything scheduled for today.
  const tasks = all.filter(
    (t) => t.mit || t.status === "In Progress" || t.doDate === today
  );

  // Completed time tracked per task (running session excluded — the client adds it live).
  const logged: Record<string, number> = {};
  const taskIds = tasks.map((t) => t.id);
  if (taskIds.length) {
    const { data: sess } = await sb
      .from("time_sessions")
      .select("task_id,started_at,ended_at")
      .in("task_id", taskIds);
    for (const s of (sess ?? []) as { task_id: string; started_at: string; ended_at: string | null }[]) {
      if (!s.ended_at) continue;
      const sec = Math.max(
        0,
        (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000
      );
      logged[s.task_id] = (logged[s.task_id] ?? 0) + sec;
    }
  }

  return { tasks, matters, today, running, logged };
}
