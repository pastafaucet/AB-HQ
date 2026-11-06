import "server-only";
import { getSupabase } from "@/lib/supabase";
import type { Task, Matter, Project, Entry, RunningTimer } from "@/lib/data";
import {
  ENTRY_COLUMNS,
  ENTRY_COLUMNS_LEGACY,
  rowToEntry,
  type EntryRowDB,
} from "@/lib/entry-map";
import { parseRule, nextOccurrence } from "@/lib/recur";
import {
  PROJECT_COLUMNS,
  selectTaskRows,
  todayISO,
  dayBounds,
  APP_TZ,
  rowToTask,
  rowToMatter,
  rowToProject,
  type MatterRowDB,
  type ProjectRowDB,
} from "@/lib/task-map";
import { inScope, type Scope } from "@/lib/scope";
import { coversDay, isPastDue } from "@/lib/task-dates";

export interface MyDayData {
  tasks: Task[]; // all tasks relevant to today (mits ∪ also-today ∪ in-progress)
  matters: Matter[];
  projects: Project[];
  today: string;
  running: RunningTimer | null;
  logged: Record<string, number>; // taskId → completed seconds tracked
}

/** All projects, active first — the shared picker list. */
async function fetchProjects(): Promise<Project[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("projects")
    .select(PROJECT_COLUMNS)
    .order("created_at", { ascending: true });
  // Migration 0011 not applied yet — degrade to no projects.
  if (error) return [];
  return (data as ProjectRowDB[]).map(rowToProject);
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

  // eslint-disable-next-line prefer-const -- mattersRes is reassigned by the retry below
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
  projects: Project[];
  today: string;
  running: RunningTimer | null;
}

/** All open tasks for the Tasks hub — the full audit view. */
export async function getTasksPageData(scope: Scope = "all"): Promise<TasksPageData> {
  const sb = getSupabase();
  const today = todayISO();

  const [allTaskRows, mattersRes, runRes, projects] = await Promise.all([
    selectTaskRows((cols) =>
      sb
        .from("tasks")
        .select(cols)
        .neq("status", "Cancelled")
        .neq("status", "Done")
        .order("created_at", { ascending: true })
    ),
    sb.from("matters").select("id,name,client,status,next_deadline"),
    sb
      .from("time_sessions")
      .select("id,task_id,started_at")
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchProjects(),
  ]);
  const taskRows = inScope(allTaskRows, scope);

  if (mattersRes.error) throw mattersRes.error;

  const running: RunningTimer | null = runRes.data
    ? {
        sessionId: runRes.data.id as string,
        taskId: runRes.data.task_id as string,
        startedAt: runRes.data.started_at as string,
      }
    : null;

  return {
    tasks: taskRows.map((r) => rowToTask(r, today)),
    matters: (mattersRes.data as MatterRowDB[]).map((r) => rowToMatter(r, today)),
    projects,
    today,
    running,
  };
}

export interface ProjectRow {
  id: string;
  name: string;
  matterId: string | null;
  matterName: string | null;
  deadline: string | null; // the project's own terminal date
  status: string;
  notes: string | null;
  openCount: number;
  overdueCount: number;
  doneCount: number;
  totalCount: number;
  nextDue: string | null; // soonest open task date
  nextDueTitle: string | null;
}

/** Every project with task rollups — the Projects hub list. */
export async function getProjectsPageData(): Promise<{
  projects: ProjectRow[];
  matters: MatterOption[];
  today: string;
  needsMigration: boolean;
}> {
  const sb = getSupabase();
  const today = todayISO();

  const [projRes, tasksRes, mattersRes] = await Promise.all([
    sb
      .from("projects")
      .select(PROJECT_COLUMNS + ",created_at")
      .order("created_at", { ascending: false }),
    sb
      .from("tasks")
      .select("project_id,status,do_date,title")
      .not("project_id", "is", null)
      .neq("status", "Cancelled"),
    sb.from("matters").select("id,name,status,disposition"),
  ]);
  if (mattersRes.error) throw mattersRes.error;
  // Migration 0011 not applied yet — show the setup notice instead of crashing.
  if (projRes.error || tasksRes.error) {
    return { projects: [], matters: [], today, needsMigration: true };
  }

  const agg = new Map<
    string,
    { open: number; overdue: number; done: number; nextDue: string | null; nextTitle: string | null }
  >();
  for (const t of tasksRes.data as {
    project_id: string;
    status: string;
    do_date: string | null;
    title: string;
  }[]) {
    const a =
      agg.get(t.project_id) ??
      { open: 0, overdue: 0, done: 0, nextDue: null, nextTitle: null };
    if (t.status === "Done") a.done += 1;
    else if (t.status !== "Someday") {
      a.open += 1;
      if (t.do_date && t.do_date < today) a.overdue += 1;
      if (t.do_date && (!a.nextDue || t.do_date < a.nextDue)) {
        a.nextDue = t.do_date;
        a.nextTitle = t.title;
      }
    }
    agg.set(t.project_id, a);
  }

  const matterRows = mattersRes.data as {
    id: string;
    name: string;
    status: string | null;
    disposition: string | null;
  }[];
  const matterName = new Map(matterRows.map((m) => [m.id, m.name]));
  const matters: MatterOption[] = matterRows
    .map((m) => ({
      id: m.id,
      name: m.name,
      closed: m.status === "Closed" || !!m.disposition,
    }))
    .sort((a, b) => Number(a.closed) - Number(b.closed) || a.name.localeCompare(b.name));

  const projects: ProjectRow[] = (projRes.data as unknown as (ProjectRowDB & { created_at: string })[]).map(
    (p) => {
      const a =
        agg.get(p.id) ?? { open: 0, overdue: 0, done: 0, nextDue: null, nextTitle: null };
      return {
        id: p.id,
        name: p.name,
        matterId: p.matter_id,
        matterName: p.matter_id ? matterName.get(p.matter_id) ?? null : null,
        deadline: p.deadline,
        status: p.status,
        notes: p.notes,
        openCount: a.open,
        overdueCount: a.overdue,
        doneCount: a.done,
        totalCount: a.open + a.done,
        nextDue: a.nextDue,
        nextDueTitle: a.nextTitle,
      };
    }
  );

  return { projects, matters, today, needsMigration: false };
}

export interface StartUpData {
  tasks: Task[]; // every open task (not Done / Cancelled)
  matters: Matter[];
  projects: Project[];
  today: string;
  intention: string | null; // today's, if already set
  onTapFromYesterday: string | null; // seeded by last Wind Down
  running: RunningTimer | null;
  life: LifeData; // morning habits + body quick-entry
}

/** All data the Start of Day surface needs: open tasks + ritual state. */
export async function getStartUpData(scope: Scope = "all"): Promise<StartUpData> {
  const sb = getSupabase();
  const today = todayISO();
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - 1);
  const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

  // Morning reset: a completed task no longer needs protection — release the
  // slot so today's picks aren't blocked by yesterday's finished MITs.
  // (Unfinished MITs stay protected: they roll into today until dropped.)
  await sb.from("tasks").update({ mit: false }).eq("mit", true).eq("status", "Done");

  // Recurring EVENTS whose date passed roll forward on their own — a weekly
  // call that happened (or didn't) shouldn't linger as overdue. Recurring
  // TASKS stay overdue until completed; completion spawns the next one.
  const { data: staleRecur } = await sb
    .from("tasks")
    .select("id,recur,do_date")
    .eq("type", "Event")
    .not("recur", "is", null)
    .lt("do_date", today)
    .neq("status", "Done")
    .neq("status", "Cancelled");
  for (const r of (staleRecur ?? []) as { id: string; recur: string; do_date: string }[]) {
    const rule = parseRule(r.recur);
    if (!rule) continue;
    let next = r.do_date;
    for (let i = 0; i < 400 && next < today; i++) next = nextOccurrence(rule, next);
    if (next >= today) await sb.from("tasks").update({ do_date: next }).eq("id", r.id);
  }

  const [allTaskRows, mattersRes, entriesRes, projects, runRes, life] = await Promise.all([
    selectTaskRows((cols) =>
      sb
        .from("tasks")
        .select(cols)
        .neq("status", "Cancelled")
        .neq("status", "Done")
        .order("created_at", { ascending: true })
    ),
    sb.from("matters").select("id,name,client,status,next_deadline"),
    sb
      .from("daily_entries")
      .select("date,intention,on_tap_for_tomorrow")
      .in("date", [today, yesterday]),
    fetchProjects(),
    sb
      .from("time_sessions")
      .select("id,task_id,started_at")
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchLifeData(today),
  ]);
  const taskRows = inScope(allTaskRows, scope);
  if (mattersRes.error) throw mattersRes.error;

  const entries = (entriesRes.error ? [] : entriesRes.data) as {
    date: string;
    intention: string | null;
    on_tap_for_tomorrow: string | null;
  }[];
  const todayEntry = entries.find((e) => e.date === today);
  const yEntry = entries.find((e) => e.date === yesterday);

  return {
    tasks: taskRows.map((r) => rowToTask(r, today)),
    matters: (mattersRes.data as MatterRowDB[]).map((r) => rowToMatter(r, today)),
    projects,
    today,
    intention: todayEntry?.intention ?? null,
    onTapFromYesterday: yEntry?.on_tap_for_tomorrow ?? null,
    running: runRes.data
      ? {
          sessionId: runRes.data.id as string,
          taskId: runRes.data.task_id as string,
          startedAt: runRes.data.started_at as string,
        }
      : null,
    life,
  };
}

export interface InboxData {
  entries: Entry[];
  matters: MatterOption[];
  projects: Project[];
  today: string;
  needsMigration: boolean;
}

/** The capture ledger, newest first — the Quick Drop / Inbox surface. */
export async function getInboxData(): Promise<InboxData> {
  const sb = getSupabase();
  const today = todayISO();

  // eslint-disable-next-line prefer-const -- entriesRes is reassigned by the legacy retry below
  let [entriesRes, mattersRes, projects] = await Promise.all([
    sb
      .from("entries")
      .select(ENTRY_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(500),
    sb.from("matters").select("id,name,status,disposition"),
    fetchProjects(),
  ]);
  if (entriesRes.error) {
    // Migration 0013 not applied yet — retry without billed_tenths.
    entriesRes = (await sb
      .from("entries")
      .select(ENTRY_COLUMNS_LEGACY)
      .order("created_at", { ascending: false })
      .limit(500)) as typeof entriesRes;
  }
  if (mattersRes.error) throw mattersRes.error;

  const matters: MatterOption[] = (mattersRes.data as {
    id: string;
    name: string;
    status: string | null;
    disposition: string | null;
  }[])
    .map((m) => ({ id: m.id, name: m.name, closed: m.status === "Closed" || !!m.disposition }))
    .sort((a, b) => Number(a.closed) - Number(b.closed) || a.name.localeCompare(b.name));

  // Migration 0012 not applied yet — show the setup notice instead of crashing.
  if (entriesRes.error) {
    return { entries: [], matters, projects, today, needsMigration: true };
  }

  return {
    entries: (entriesRes.data as EntryRowDB[]).map(rowToEntry),
    matters,
    projects,
    today,
    needsMigration: false,
  };
}

export interface SilentMatter {
  id: string;
  name: string;
  client: string | null;
  lastTouch: string | null; // ISO date of last entry/task activity; null = never
  daysSilent: number | null;
  openCount: number;
  hasFuture: boolean; // any open task dated today or later
}

export interface DueMarker {
  date: string;
  title: string;
  kind: "project" | "matter";
  matterName: string | null;
}

export interface WeeklyReviewData {
  today: string;
  activeMatters: number;
  // the week that was (rolling 7 days incl. today)
  lookback: {
    done: number;
    captured: number;
    tenthsTotal: number;
    byMatter: { name: string; tenths: number }[]; // top matters by billed tenths
    touchedMatters: number;
  };
  // the road ahead
  dueTasks: Task[]; // next 30 days, full task objects — drawer-editable
  dueMarkers: DueMarker[]; // project/matter terminal deadlines in the window
  waitingTasks: Task[]; // waiting_on set — bucketed client-side
  silent: SilentMatter[];
  quiet: SilentMatter[]; // touched recently but nothing scheduled
  // the life week
  lifeReady: boolean;
  weekDates: string[]; // 7 dates, oldest → today
  habitsWeek: { name: string; days: boolean[] }[];
  bodyWeek: { weightStart: number | null; weightEnd: number | null; sleepAvg: number | null };
  mediaWeek: { date: string; kind: string; title: string; note: string | null }[];
  // for the drawer
  matters: Matter[];
  projects: Project[];
  running: RunningTimer | null;
}

export interface CommandCenterData {
  today: string;
  hour: number; // 0–23 in app timezone, for the greeting
  // attention band
  dueToday: number;
  overdue: number;
  needsHome: number;
  silent: number;
  // daily flow state
  intentionSet: boolean;
  mitCount: number;
  mitDone: number;
  dayClosed: boolean; // reflection or on-tap written
  habitsDone: number;
  habitsTotal: number;
  // hub cards
  openTasks: number;
  activeMatters: number;
  quietMatters: number;
  activeProjects: number;
  nextProjectDeadline: string | null;
  ledgerCount: number; // total entries in the ledger
  tenthsToday: number;
  due30: number;
  waiting: number;
  noteCount: number;
  peopleCount: number;
  // the actual things, not just counts
  upNextTasks: Task[]; // next dated open tasks, richest form — drawer-editable
  upNextMarkers: { date: string; title: string; kind: "project" | "matter"; matterName: string | null }[];
  overdueTop: { id: string; title: string; matterName: string | null; doDate: string }[];
  silentTop: { name: string; daysSilent: number | null; openCount: number }[];
  unfiledLatest: string | null; // newest entry still needing a home
  touchedToday: number; // distinct matters with activity today
  nextProjectName: string | null;
  matters: Matter[]; // for the drawer + name lookups
  projects: Project[];
  running: RunningTimer | null;
}

/** Where things stand at a glance — the home surface. */
export async function getCommandCenterData(scope: Scope = "all"): Promise<CommandCenterData> {
  const sb = getSupabase();
  const today = todayISO();
  const { startIso, endIso } = dayBounds(today);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, hour: "numeric", hour12: false }).format(
      new Date()
    )
  );

  const [weekly, life, allTaskRows, entriesCounts, todayEntries, daily, notesRes, peopleRes] =
    await Promise.all([
      getWeeklyReviewData(),
      fetchLifeData(today),
      selectTaskRows((cols) =>
        sb.from("tasks").select(cols).neq("status", "Cancelled").neq("status", "Done")
      ),
      sb
        .from("entries")
        .select("id,status,raw", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(2000),
      sb
        .from("entries")
        .select("billed_tenths,matter_id")
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .neq("status", "dismissed"),
      sb
        .from("daily_entries")
        .select("intention,reflection,on_tap_for_tomorrow")
        .eq("date", today)
        .maybeSingle(),
      sb.from("notes").select("id", { count: "exact", head: true }),
      sb.from("people").select("id", { count: "exact", head: true }),
    ]);
  const taskRows = inScope(allTaskRows, scope);
  const [{ data: matterNamesData }, runRes] = await Promise.all([
    sb.from("matters").select("id,name,client,status,next_deadline"),
    sb
      .from("time_sessions")
      .select("id,task_id,started_at")
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const matterRows = (matterNamesData ?? []) as MatterRowDB[];
  const matterNames = new Map(matterRows.map((m) => [m.id, m.name]));

  const open = taskRows.map((r) => rowToTask(r, today)).filter((t) => t.status !== "Someday");
  const mits = open.filter((t) => t.mit);
  // Done MITs left today's list at completion; count Done-with-mit via a cheap check.
  const { count: mitDoneCount } = await sb
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("mit", true)
    .eq("status", "Done");

  const entryRows = (entriesCounts.error ? [] : entriesCounts.data) as {
    status: string;
    raw: string;
  }[];
  const todayEntryRows = (todayEntries.error
    ? []
    : todayEntries.data) as { billed_tenths: number | null; matter_id: string | null }[];
  const todaysTenths = todayEntryRows.reduce((a, e) => a + (e.billed_tenths ?? 0), 0);
  const touchedToday = new Set(todayEntryRows.map((e) => e.matter_id).filter(Boolean)).size;

  const projects = await fetchProjects();
  const activeP = projects.filter((p) => p.status === "Active");
  const nextProject =
    activeP
      .filter((p) => p.deadline && p.deadline >= today)
      .sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1))[0] ?? null;

  const overdueTop = open
    .filter((t) => isPastDue(t, today))
    .sort((a, b) => (a.doDate! < b.doDate! ? -1 : 1))
    .slice(0, 4)
    .map((t) => ({
      id: t.id,
      title: t.title,
      matterName: t.matterId ? matterNames.get(t.matterId) ?? null : null,
      doDate: t.doDate!,
    }));

  // Up next: real tasks (drawer-editable), dated today through +30, sorted
  // date → timed-first/time → priority. Project/matter terminal deadlines
  // ride along as thin markers.
  const h = new Date(`${today}T12:00:00`);
  h.setDate(h.getDate() + 30);
  const horizon30 = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(
    h.getDate()
  ).padStart(2, "0")}`;
  const upNextTasks = open
    .filter((t) => t.doDate && t.doDate >= today && t.doDate <= horizon30)
    .sort((a, b) => {
      if (a.doDate !== b.doDate) return a.doDate! < b.doDate! ? -1 : 1;
      const at = a.doTime ?? "99:99";
      const bt = b.doTime ?? "99:99";
      if (at !== bt) return at < bt ? -1 : 1;
      return a.priority - b.priority;
    })
    .slice(0, 8);
  const upNextMarkers = [
    ...activeP
      .filter((p) => p.deadline && p.deadline >= today && p.deadline <= horizon30)
      .map((p) => ({
        date: p.deadline!,
        title: p.name,
        kind: "project" as const,
        matterName: p.matterId ? matterNames.get(p.matterId) ?? null : null,
      })),
    ...matterRows
      .filter((m) => m.next_deadline && m.next_deadline >= today && m.next_deadline <= horizon30)
      .map((m) => ({
        date: m.next_deadline!,
        title: `${m.name} — matter deadline`,
        kind: "matter" as const,
        matterName: m.name,
      })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    today,
    hour,
    dueToday: open.filter((t) => coversDay(t, today)).length,
    overdue: open.filter((t) => isPastDue(t, today)).length,
    needsHome: entryRows.filter((e) => e.status === "inbox").length,
    silent: weekly.silent.length,
    intentionSet: !!daily.data?.intention,
    mitCount: mits.length + (mitDoneCount ?? 0),
    mitDone: mitDoneCount ?? 0,
    dayClosed: !!(daily.data?.reflection || daily.data?.on_tap_for_tomorrow),
    habitsDone: life.habits.filter((h) => h.checkedToday).length,
    habitsTotal: life.habits.length,
    openTasks: open.length,
    activeMatters: weekly.activeMatters,
    quietMatters: weekly.quiet.length,
    activeProjects: activeP.length,
    nextProjectDeadline: nextProject?.deadline ?? null,
    nextProjectName: nextProject?.name ?? null,
    upNextTasks,
    upNextMarkers,
    overdueTop,
    silentTop: weekly.silent
      .slice(0, 5)
      .map((m) => ({ name: m.name, daysSilent: m.daysSilent, openCount: m.openCount })),
    unfiledLatest: entryRows.find((e) => e.status === "inbox")?.raw ?? null,
    touchedToday,
    matters: matterRows.map((r) => rowToMatter(r, today)),
    projects,
    running: runRes.data
      ? {
          sessionId: runRes.data.id as string,
          taskId: runRes.data.task_id as string,
          startedAt: runRes.data.started_at as string,
        }
      : null,
    ledgerCount: entriesCounts.count ?? entryRows.length,
    tenthsToday: todaysTenths,
    due30: weekly.dueTasks.length + weekly.dueMarkers.length,
    waiting: weekly.waitingTasks.length,
    noteCount: notesRes.count ?? 0,
    peopleCount: peopleRes.count ?? 0,
  };
}

const SILENCE_DAYS = 21;

/** The whole book at once — the Friday review. */
export async function getWeeklyReviewData(): Promise<WeeklyReviewData> {
  const sb = getSupabase();
  const today = todayISO();
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() + 30);
  const horizon = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const shiftIso = (iso: string, n: number) => {
    const x = new Date(`${iso}T12:00:00`);
    x.setDate(x.getDate() + n);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
      x.getDate()
    ).padStart(2, "0")}`;
  };
  const weekDates = Array.from({ length: 7 }, (_, i) => shiftIso(today, i - 6));
  const weekStartIso = dayBounds(weekDates[0]).startIso;

  // eslint-disable-next-line prefer-const -- entriesRes is reassigned by the legacy retry below
  let [mattersRes, taskRows, projRes, entriesRes, touchRes, habitsRes, checksRes, bodyRes, mediaRes, runRes] =
    await Promise.all([
      sb.from("matters").select("id,name,client,status,disposition,next_deadline,created_at"),
      selectTaskRows((cols) =>
        sb.from("tasks").select(cols).neq("status", "Cancelled").order("created_at", { ascending: true })
      ),
      sb.from("projects").select(PROJECT_COLUMNS),
      sb.from("entries").select("id,matter_id,created_at,billed_tenths"),
      sb.from("tasks").select("matter_id,created_at,completed_at").neq("status", "Cancelled"),
      sb.from("habits").select("id,name,sort").eq("active", true).order("sort").order("created_at"),
      sb.from("habit_checks").select("habit_id,date").gte("date", weekDates[0]),
      sb
        .from("body_metrics")
        .select("date,weight_lbs,sleep_hours")
        .gte("date", weekDates[0])
        .order("date"),
      sb.from("media_log").select("date,kind,title,note").gte("date", weekDates[0]).order("date"),
      sb
        .from("time_sessions")
        .select("id,task_id,started_at")
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  if (entriesRes.error) {
    // Pre-0013 — retry without billed_tenths.
    entriesRes = (await sb
      .from("entries")
      .select("id,matter_id,created_at")) as typeof entriesRes;
  }
  if (mattersRes.error) throw mattersRes.error;

  const matters = (mattersRes.data as {
    id: string;
    name: string;
    client: string | null;
    status: string | null;
    disposition: string | null;
    next_deadline: string | null;
    created_at: string;
  }[]).filter((m) => m.status !== "Closed" && !m.disposition);
  const matterName = new Map(matters.map((m) => [m.id, m.name]));

  const tasks = taskRows.map((r) => rowToTask(r, today));
  const open = tasks.filter((t) => t.status !== "Done" && t.status !== "Someday");
  const projects = (projRes.error ? [] : (projRes.data as ProjectRowDB[])).map(rowToProject);
  const entries = (entriesRes.error ? [] : entriesRes.data) as {
    id: string;
    matter_id: string | null;
    created_at: string;
    billed_tenths?: number | null;
  }[];

  // --- due in the next 30 days: full tasks + project/matter deadline markers ---
  const dueTasks = open
    .filter((t) => t.doDate && t.doDate >= today && t.doDate <= horizon)
    .sort((a, b) => {
      if (a.doDate !== b.doDate) return a.doDate! < b.doDate! ? -1 : 1;
      const at = a.doTime ?? "99:99";
      const bt = b.doTime ?? "99:99";
      if (at !== bt) return at < bt ? -1 : 1;
      return a.priority - b.priority;
    });
  const dueMarkers: DueMarker[] = [
    ...projects
      .filter(
        (p) => p.status === "Active" && p.deadline && p.deadline >= today && p.deadline <= horizon
      )
      .map((p) => ({
        date: p.deadline!,
        title: p.name,
        kind: "project" as const,
        matterName: p.matterId ? matterName.get(p.matterId) ?? null : null,
      })),
    ...matters
      .filter((m) => m.next_deadline && m.next_deadline >= today && m.next_deadline <= horizon)
      .map((m) => ({
        date: m.next_deadline!,
        title: `${m.name} — matter deadline`,
        kind: "matter" as const,
        matterName: m.name,
      })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));

  // --- waiting on ---
  const waitingTasks = open.filter((t) => t.waitingOn);

  // --- the week that was ---
  const weekEntries = entries.filter((e) => e.created_at >= weekStartIso);
  const tenthsByMatter = new Map<string, number>();
  for (const e of weekEntries) {
    if (!e.matter_id || !e.billed_tenths) continue;
    tenthsByMatter.set(e.matter_id, (tenthsByMatter.get(e.matter_id) ?? 0) + e.billed_tenths);
  }
  const lookback = {
    done: ((touchRes.error ? [] : touchRes.data) as { completed_at: string | null }[]).filter(
      (t) => t.completed_at && t.completed_at >= weekStartIso
    ).length,
    captured: weekEntries.length,
    tenthsTotal: weekEntries.reduce((a, e) => a + (e.billed_tenths ?? 0), 0),
    byMatter: [...tenthsByMatter.entries()]
      .map(([id, tenths]) => ({ name: matterName.get(id) ?? "—", tenths }))
      .sort((a, b) => b.tenths - a.tenths)
      .slice(0, 5),
    touchedMatters: new Set(weekEntries.map((e) => e.matter_id).filter(Boolean)).size,
  };

  // --- the life week ---
  const lifeReady = !habitsRes.error && !bodyRes.error && !mediaRes.error;
  const checksByHabit = new Map<string, Set<string>>();
  for (const c of ((checksRes.error ? [] : checksRes.data) ?? []) as {
    habit_id: string;
    date: string;
  }[]) {
    if (!checksByHabit.has(c.habit_id)) checksByHabit.set(c.habit_id, new Set());
    checksByHabit.get(c.habit_id)!.add(c.date);
  }
  const habitsWeek = (((habitsRes.error ? [] : habitsRes.data) ?? []) as {
    id: string;
    name: string;
  }[]).map((h) => ({
    name: h.name,
    days: weekDates.map((d) => checksByHabit.get(h.id)?.has(d) ?? false),
  }));
  const bodyRows = ((bodyRes.error ? [] : bodyRes.data) ?? []) as {
    date: string;
    weight_lbs: number | null;
    sleep_hours: number | null;
  }[];
  const weights = bodyRows.map((b) => b.weight_lbs).filter((w): w is number => w != null);
  const sleeps = bodyRows.map((b) => b.sleep_hours).filter((s): s is number => s != null);
  const bodyWeek = {
    weightStart: weights[0] ?? null,
    weightEnd: weights[weights.length - 1] ?? null,
    sleepAvg: sleeps.length ? Math.round((sleeps.reduce((a, s) => a + s, 0) / sleeps.length) * 10) / 10 : null,
  };
  const mediaWeek = ((mediaRes.error ? [] : mediaRes.data) ?? []) as WeeklyReviewData["mediaWeek"];

  // --- last touch + scheduling per matter ---
  const lastTouch = new Map<string, string>(); // matterId → ISO timestamp
  const bump = (mid: string | null | undefined, iso: string | undefined) => {
    if (!mid || !iso) return;
    const cur = lastTouch.get(mid);
    if (!cur || iso > cur) lastTouch.set(mid, iso);
  };
  // A matter's own creation counts as its first touch — a freshly imported
  // book starts at day zero instead of uniformly "never touched".
  for (const m of matters) bump(m.id, m.created_at);
  for (const e of entries) bump(e.matter_id, e.created_at);
  const touches = (touchRes.error ? [] : touchRes.data) as {
    matter_id: string | null;
    created_at: string;
    completed_at: string | null;
  }[];
  for (const r of touches) {
    bump(r.matter_id, r.created_at);
    bump(r.matter_id, r.completed_at ?? undefined);
  }

  const openByMatter = new Map<string, { open: number; future: boolean }>();
  for (const t of open) {
    if (!t.matterId) continue;
    const agg = openByMatter.get(t.matterId) ?? { open: 0, future: false };
    agg.open += 1;
    if (t.doDate && t.doDate >= today) agg.future = true;
    openByMatter.set(t.matterId, agg);
  }

  const silent: SilentMatter[] = [];
  const quiet: SilentMatter[] = [];
  const nowMs = new Date(`${today}T12:00:00`).getTime();
  for (const m of matters) {
    const touch = lastTouch.get(m.id) ?? null;
    const days = touch ? Math.floor((nowMs - new Date(touch).getTime()) / 86400000) : null;
    const agg = openByMatter.get(m.id) ?? { open: 0, future: false };
    const hasFutureDeadline = !!(m.next_deadline && m.next_deadline >= today);
    const scheduled = agg.future || hasFutureDeadline;
    const row: SilentMatter = {
      id: m.id,
      name: m.name,
      client: m.client,
      lastTouch: touch,
      daysSilent: days,
      openCount: agg.open,
      hasFuture: scheduled,
    };
    if (scheduled) continue; // something is on the calendar — not a surprise risk
    if (days === null || days >= SILENCE_DAYS) silent.push(row);
    else quiet.push(row);
  }
  silent.sort((a, b) => (b.daysSilent ?? 9999) - (a.daysSilent ?? 9999));
  quiet.sort((a, b) => (b.daysSilent ?? 0) - (a.daysSilent ?? 0));

  return {
    today,
    activeMatters: matters.length,
    lookback,
    dueTasks,
    dueMarkers,
    waitingTasks,
    silent,
    quiet,
    lifeReady,
    weekDates,
    habitsWeek,
    bodyWeek,
    mediaWeek,
    matters: matters.map((m) => rowToMatter(m, today)),
    projects,
    running: runRes.data
      ? {
          sessionId: runRes.data.id as string,
          taskId: runRes.data.task_id as string,
          startedAt: runRes.data.started_at as string,
        }
      : null,
  };
}

export interface LedgerGroup {
  matterId: string | null; // null = unattributed
  matterName: string | null;
  client: string | null;
  entries: Entry[];
  sessions: { taskTitle: string; minutes: number }[];
  doneTasks: string[];
  totalMinutes: number; // tracked timer time
  totalTenths: number; // entered billed time (sum of entry tenths)
}

export interface DayLedgerData {
  date: string;
  groups: LedgerGroup[];
  needsMigration: boolean;
}

/** Everything that happened on one day (Pacific), grouped by matter — feeds billing. */
export async function getDayLedgerData(date: string): Promise<DayLedgerData> {
  const sb = getSupabase();
  const { startIso: dayStart, endIso: dayEnd } = dayBounds(date);

  // eslint-disable-next-line prefer-const -- entriesRes is reassigned by the legacy retry below
  let [entriesRes, mattersRes, sessRes, doneRes] = await Promise.all([
    sb
      .from("entries")
      .select(ENTRY_COLUMNS)
      .gte("created_at", dayStart)
      .lt("created_at", dayEnd)
      .neq("status", "dismissed")
      .order("created_at", { ascending: true }),
    sb.from("matters").select("id,name,client"),
    sb
      .from("time_sessions")
      .select("task_id,started_at,ended_at")
      .gte("started_at", dayStart)
      .lt("started_at", dayEnd),
    sb
      .from("tasks")
      .select("id,title,matter_id,completed_at")
      .eq("status", "Done")
      .gte("completed_at", dayStart)
      .lt("completed_at", dayEnd),
  ]);
  if (mattersRes.error) throw mattersRes.error;
  if (entriesRes.error) {
    // Migration 0013 not applied yet — retry without billed_tenths.
    entriesRes = (await sb
      .from("entries")
      .select(ENTRY_COLUMNS_LEGACY)
      .gte("created_at", dayStart)
      .lt("created_at", dayEnd)
      .neq("status", "dismissed")
      .order("created_at", { ascending: true })) as typeof entriesRes;
  }
  const needsMigration = !!entriesRes.error;

  const matters = mattersRes.data as { id: string; name: string; client: string | null }[];
  const matterById = new Map(matters.map((m) => [m.id, m]));
  const entries = (entriesRes.error ? [] : (entriesRes.data as EntryRowDB[])).map(rowToEntry);

  // Session minutes need the task's matter — fetch titles/matters for involved tasks.
  const sess = (sessRes.error ? [] : sessRes.data) as {
    task_id: string;
    started_at: string;
    ended_at: string | null; // null = timer still running — counts up to now
  }[];
  const doneTasks = (doneRes.error ? [] : doneRes.data) as {
    id: string;
    title: string;
    matter_id: string | null;
    completed_at: string;
  }[];
  const sessTaskIds = [...new Set(sess.map((s) => s.task_id))];
  const taskInfo = new Map<string, { title: string; matterId: string | null }>();
  for (const t of doneTasks) taskInfo.set(t.id, { title: t.title, matterId: t.matter_id });
  const missing = sessTaskIds.filter((id) => !taskInfo.has(id));
  if (missing.length) {
    const { data } = await sb.from("tasks").select("id,title,matter_id").in("id", missing);
    for (const t of (data ?? []) as { id: string; title: string; matter_id: string | null }[]) {
      taskInfo.set(t.id, { title: t.title, matterId: t.matter_id });
    }
  }

  const groups = new Map<string, LedgerGroup>();
  const groupFor = (matterId: string | null): LedgerGroup => {
    const key = matterId ?? "__none__";
    let g = groups.get(key);
    if (!g) {
      const m = matterId ? matterById.get(matterId) : undefined;
      g = {
        matterId,
        matterName: m?.name ?? null,
        client: m?.client ?? null,
        entries: [],
        sessions: [],
        doneTasks: [],
        totalMinutes: 0,
        totalTenths: 0,
      };
      groups.set(key, g);
    }
    return g;
  };

  for (const e of entries) {
    const g = groupFor(e.matterId ?? null);
    g.entries.push(e);
    g.totalTenths += e.billedTenths ?? 0;
  }
  for (const s of sess) {
    const info = taskInfo.get(s.task_id);
    const endMs = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
    const minutes = Math.round(Math.max(0, endMs - new Date(s.started_at).getTime()) / 60000);
    if (minutes < 1) continue;
    const g = groupFor(info?.matterId ?? null);
    const existing = g.sessions.find((x) => x.taskTitle === (info?.title ?? "Untimed work"));
    if (existing) existing.minutes += minutes;
    else g.sessions.push({ taskTitle: info?.title ?? "Untimed work", minutes });
    g.totalMinutes += minutes;
  }
  // A completed task that also has timer sessions today is already shown
  // (and timed) via its sessions — don't list it twice.
  const sessTaskSet = new Set(sess.map((s) => s.task_id));
  for (const t of doneTasks) {
    if (sessTaskSet.has(t.id)) continue;
    groupFor(t.matter_id).doneTasks.push(t.title);
  }

  const list = [...groups.values()].sort((a, b) => {
    if (a.matterId === null) return 1;
    if (b.matterId === null) return -1;
    return (a.matterName ?? "").localeCompare(b.matterName ?? "");
  });

  return { date, groups: list, needsMigration };
}

export interface HabitRow {
  id: string;
  name: string;
  checkedToday: boolean;
  streak: number; // consecutive days incl. today (or ending yesterday if unchecked)
}

export interface BodyRow {
  weightLbs: number | null;
  sleepHours: number | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  workout: string | null;
}

export interface MediaRow {
  id: string;
  kind: "show" | "movie" | "game" | "book";
  title: string;
  note: string | null;
}

export interface LifeData {
  lifeReady: boolean; // false until migration 0015
  habits: HabitRow[];
  body: BodyRow | null;
  journal: string | null;
  journalLastYear: string | null;
  mediaToday: MediaRow[];
}

/** Journal / habits / media / body for one day — shared by both rituals. */
async function fetchLifeData(today: string): Promise<LifeData> {
  const sb = getSupabase();
  const d = new Date(`${today}T12:00:00`);
  d.setFullYear(d.getFullYear() - 1);
  const yearAgo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const s = new Date(`${today}T12:00:00`);
  s.setDate(s.getDate() - 90);
  const since = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(
    s.getDate()
  ).padStart(2, "0")}`;

  const [habitsRes, checksRes, bodyRes, mediaRes, jToday, jYear] = await Promise.all([
    sb.from("habits").select("id,name,sort").eq("active", true).order("sort").order("created_at"),
    sb.from("habit_checks").select("habit_id,date").gte("date", since),
    sb
      .from("body_metrics")
      .select("weight_lbs,sleep_hours,calories,protein_g,carbs_g,fat_g,workout")
      .eq("date", today)
      .maybeSingle(),
    sb.from("media_log").select("id,kind,title,note").eq("date", today).order("created_at"),
    sb.from("daily_entries").select("journal").eq("date", today).maybeSingle(),
    sb.from("daily_entries").select("journal").eq("date", yearAgo).maybeSingle(),
  ]);

  const lifeReady = !habitsRes.error && !mediaRes.error && !bodyRes.error && !jToday.error;
  if (!lifeReady) {
    return { lifeReady, habits: [], body: null, journal: null, journalLastYear: null, mediaToday: [] };
  }

  const checksByHabit = new Map<string, Set<string>>();
  for (const c of (checksRes.data ?? []) as { habit_id: string; date: string }[]) {
    if (!checksByHabit.has(c.habit_id)) checksByHabit.set(c.habit_id, new Set());
    checksByHabit.get(c.habit_id)!.add(c.date);
  }
  const shiftDay = (iso: string, n: number) => {
    const x = new Date(`${iso}T12:00:00`);
    x.setDate(x.getDate() + n);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
      x.getDate()
    ).padStart(2, "0")}`;
  };
  const habits: HabitRow[] = ((habitsRes.data ?? []) as { id: string; name: string }[]).map(
    (h) => {
      const dates = checksByHabit.get(h.id) ?? new Set();
      const checkedToday = dates.has(today);
      let streak = 0;
      let cursor = checkedToday ? today : shiftDay(today, -1);
      while (dates.has(cursor)) {
        streak += 1;
        cursor = shiftDay(cursor, -1);
      }
      return { id: h.id, name: h.name, checkedToday, streak };
    }
  );

  const b = bodyRes.data as {
    weight_lbs: number | null;
    sleep_hours: number | null;
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    workout: string | null;
  } | null;

  return {
    lifeReady,
    habits,
    body: b
      ? {
          weightLbs: b.weight_lbs,
          sleepHours: b.sleep_hours,
          calories: b.calories,
          proteinG: b.protein_g,
          carbsG: b.carbs_g,
          fatG: b.fat_g,
          workout: b.workout,
        }
      : null,
    journal: (jToday.data as { journal: string | null } | null)?.journal ?? null,
    journalLastYear: (jYear.data as { journal: string | null } | null)?.journal ?? null,
    mediaToday: (mediaRes.data ?? []) as MediaRow[],
  };
}

export interface WindDownData {
  today: string;
  tomorrow: string;
  doneToday: Task[];
  mits: Task[]; // still-protected MITs (the roll/drop decisions)
  candidates: Task[]; // open, unprotected picks for tomorrow's 3
  inboxEntries: Entry[]; // Quick Drop items still needing a home
  capturedToday: number;
  tenthsToday: number;
  matters: Matter[];
  matterOptions: MatterOption[];
  projects: Project[];
  onTapForTomorrow: string | null;
  reflection: string | null;
  entriesReady: boolean; // false until migration 0012
  life: LifeData;
  running: RunningTimer | null;
  mediaTitles: { kind: string; title: string }[]; // distinct prior titles, most recent first — autocomplete
}

/** Everything the evening ritual needs: close loops, clear the inbox, set tomorrow. */
export async function getWindDownData(scope: Scope = "all"): Promise<WindDownData> {
  const sb = getSupabase();
  const today = todayISO();
  const { startIso, endIso } = dayBounds(today);
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() + 1);
  const tomorrow = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

  const [allTaskRows, allDoneRows, mattersRes, projects, entriesRes, entryRes, life, runRes, titlesRes] =
    await Promise.all([
    selectTaskRows((cols) =>
      sb
        .from("tasks")
        .select(cols)
        .neq("status", "Cancelled")
        .neq("status", "Done")
        .order("created_at", { ascending: true })
    ),
    selectTaskRows((cols) =>
      sb
        .from("tasks")
        .select(cols)
        .eq("status", "Done")
        .gte("completed_at", startIso)
        .lt("completed_at", endIso)
        .order("completed_at", { ascending: true })
    ),
    sb.from("matters").select("id,name,client,status,next_deadline,disposition"),
    fetchProjects(),
    sb.from("entries").select(ENTRY_COLUMNS).order("created_at", { ascending: false }).limit(300),
    sb
      .from("daily_entries")
      .select("on_tap_for_tomorrow,reflection")
      .eq("date", today)
      .maybeSingle(),
    fetchLifeData(today),
    sb
      .from("time_sessions")
      .select("id,task_id,started_at")
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from("media_log").select("kind,title").order("created_at", { ascending: false }).limit(500),
  ]);
  const taskRows = inScope(allTaskRows, scope);
  const doneRows = inScope(allDoneRows, scope);
  if (mattersRes.error) throw mattersRes.error;

  const matterRows = mattersRes.data as (MatterRowDB & { disposition: string | null })[];
  const matters = matterRows.map((r) => rowToMatter(r, today));
  const matterOptions: MatterOption[] = matterRows
    .map((m) => ({
      id: m.id,
      name: m.name,
      closed: m.status === "Closed" || !!m.disposition,
    }))
    .sort((a, b) => Number(a.closed) - Number(b.closed) || a.name.localeCompare(b.name));

  const entriesReady = !entriesRes.error;
  const allEntries = (entriesRes.error ? [] : (entriesRes.data as EntryRowDB[])).map(rowToEntry);
  const inboxEntries = allEntries.filter((e) => e.status === "inbox");
  const todaysEntries = allEntries.filter(
    (e) => e.createdAt >= startIso && e.createdAt < endIso && e.status !== "dismissed"
  );

  const open = taskRows.map((r) => rowToTask(r, today)).filter((t) => t.status !== "Someday");
  const mits = open.filter((t) => t.mit);
  // Candidates for tomorrow's 3: overdue, today's leftovers, and tomorrow's
  // items — plus UNDATED high-priority work. Never dated-future tasks.
  const candidates = open
    .filter(
      (t) =>
        !t.mit &&
        (t.doDate
          ? t.doDate <= tomorrow
          : t.priority <= 2 && t.status !== "Inbox")
    )
    .sort((a, b) => {
      const ad = a.doDate ?? "9999";
      const bd = b.doDate ?? "9999";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a.priority - b.priority;
    })
    .slice(0, 20);

  return {
    today,
    tomorrow,
    doneToday: doneRows.map((r) => rowToTask(r, today)),
    mits,
    candidates,
    inboxEntries,
    capturedToday: todaysEntries.length,
    tenthsToday: todaysEntries.reduce((a, e) => a + (e.billedTenths ?? 0), 0),
    matters,
    matterOptions,
    projects,
    onTapForTomorrow: entryRes.data?.on_tap_for_tomorrow ?? null,
    reflection: entryRes.data?.reflection ?? null,
    entriesReady,
    life,
    running: runRes.data
      ? {
          sessionId: runRes.data.id as string,
          taskId: runRes.data.task_id as string,
          startedAt: runRes.data.started_at as string,
        }
      : null,
    mediaTitles: (() => {
      const seen = new Set<string>();
      const out: { kind: string; title: string }[] = [];
      for (const r of ((titlesRes.error ? [] : titlesRes.data) ?? []) as {
        kind: string;
        title: string;
      }[]) {
        const key = `${r.kind}:${r.title.trim().toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ kind: r.kind, title: r.title.trim() });
      }
      return out;
    })(),
  };
}

/** All data the My Day (Today) surface needs, for the current calendar day. */
export async function getMyDayData(scope: Scope = "all"): Promise<MyDayData> {
  const sb = getSupabase();
  const today = todayISO();

  const [allTaskRows, mattersRes, runRes, projects] = await Promise.all([
    selectTaskRows((cols) =>
      sb
        .from("tasks")
        .select(cols)
        .neq("status", "Cancelled")
        .order("created_at", { ascending: true })
    ),
    sb.from("matters").select("id,name,client,status,next_deadline"),
    sb
      .from("time_sessions")
      .select("id,task_id,started_at")
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchProjects(),
  ]);
  const taskRows = inScope(allTaskRows, scope);

  if (mattersRes.error) throw mattersRes.error;

  const running: RunningTimer | null = runRes.data
    ? {
        sessionId: runRes.data.id as string,
        taskId: runRes.data.task_id as string,
        startedAt: runRes.data.started_at as string,
      }
    : null;

  const all = taskRows.map((r) => rowToTask(r, today));
  const matters = (mattersRes.data as MatterRowDB[]).map((r) => rowToMatter(r, today));

  // Only the tasks that belong on My Day: protected MITs, anything in
  // progress, and anything scheduled for today.
  const tasks = all.filter(
    (t) => t.mit || t.status === "In Progress" || coversDay(t, today)
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

  return { tasks, matters, projects, today, running, logged };
}
