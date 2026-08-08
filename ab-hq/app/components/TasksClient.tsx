"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type {
  Task,
  Matter,
  RunningTimer,
  TimeSession,
  ActivityItem,
} from "@/lib/data";
import { PRIORITY_META, DOMAIN_DOT } from "@/lib/data";
import { parseQuickAdd } from "@/lib/quick-parse";
import { applyPatch, fullPatch } from "@/lib/task-patch";
import {
  setTaskDone,
  updateTask,
  createTask,
  deleteTask,
  listActivity,
  listDoneTasks,
  type TaskPatch,
} from "@/app/(app)/task-actions";
import {
  startTimer,
  stopTimer,
  listSessions,
  addSession,
  updateSession,
  deleteSession,
} from "@/app/(app)/time-actions";
import TaskDrawer from "./TaskDrawer";

const DRAFT = "draft";
const PRI_COLOR: Record<number, string> = { 1: "#e0665a", 2: "#5fbf8f", 3: "#d8a657", 4: "#6f7787" };
const VIEW_STORE = "abhq.tasksView";

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

type ViewKey =
  | "triage"
  | "week"
  | "deadlines"
  | "priorities"
  | "unscheduled"
  | "someday"
  | "calendar"
  | "all"
  | "done";

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "triage", label: "Triage" },
  { key: "week", label: "This Week" },
  { key: "deadlines", label: "Deadlines" },
  { key: "priorities", label: "Priorities" },
  { key: "unscheduled", label: "Unscheduled" },
  { key: "someday", label: "Someday" },
  { key: "calendar", label: "Calendar" },
  { key: "all", label: "All" },
  { key: "done", label: "Done" },
];

function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function daysFromToday(iso: string, todayIso: string): number {
  return Math.round((fromISO(iso).getTime() - fromISO(todayIso).getTime()) / 86400000);
}

function taskSort(a: Task, b: Task): number {
  const ad = a.doDate ?? "9999-99-99";
  const bd = b.doDate ?? "9999-99-99";
  if (ad !== bd) return ad < bd ? -1 : 1;
  const at = a.doTime ?? "99:99";
  const bt = b.doTime ?? "99:99";
  if (at !== bt) return at < bt ? -1 : 1;
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.title.localeCompare(b.title);
}
function prioritySort(a: Task, b: Task): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.title.localeCompare(b.title);
}

interface Group {
  label: string;
  cls?: string;
  items: Task[];
}

export default function TasksClient({
  initialTasks,
  matters,
  today,
  initialRunning,
  initialMatterId = null,
}: {
  initialTasks: Task[];
  matters: Matter[];
  today: string;
  initialRunning: RunningTimer | null;
  initialMatterId?: string | null;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [draft, setDraft] = useState<Task | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [quick, setQuick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // --- view + filters ---
  // Arriving from the Cases hub (?matter=): open on All, pre-filtered to that case.
  const [view, setViewState] = useState<ViewKey>(initialMatterId ? "all" : "triage");
  const [fQ, setFQ] = useState("");
  const [fMatter, setFMatter] = useState(initialMatterId ?? "");
  const [fPri, setFPri] = useState(0); // 0 = any
  const [fType, setFType] = useState("");
  const [fMit, setFMit] = useState(false);
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  useEffect(() => {
    if (initialMatterId) return; // deliberate arrival at a case view — don't restore
    try {
      const v = localStorage.getItem(VIEW_STORE) as ViewKey | null;
      if (v && VIEWS.some((x) => x.key === v)) setViewState(v);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- completed tasks: fetched lazily when the Done view opens ---
  const [doneTasks, setDoneTasks] = useState<Task[] | null>(null);
  const [doneLoading, setDoneLoading] = useState(false);
  const [doneDays, setDoneDays] = useState(30); // 0 = all time
  const doneFetchedFor = useRef<number | null>(null);
  useEffect(() => {
    if (view !== "done" || doneFetchedFor.current === doneDays) return;
    doneFetchedFor.current = doneDays;
    setDoneLoading(true);
    (async () => {
      const since = doneDays ? new Date(Date.now() - doneDays * 86400000).toISOString() : null;
      const r = await listDoneTasks(since);
      setDoneLoading(false);
      if (r.ok) setDoneTasks(r.tasks);
      else flash(r.error ?? "Couldn't load completed tasks.");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, doneDays]);
  function setView(v: ViewKey) {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_STORE, v);
    } catch {}
  }

  // --- calendar month ---
  const [calY, setCalY] = useState(() => fromISO(today).getFullYear());
  const [calM, setCalM] = useState(() => fromISO(today).getMonth());
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  function shiftMonth(by: number) {
    const d = new Date(calY, calM + by, 1);
    setCalY(d.getFullYear());
    setCalM(d.getMonth());
    setExpandedDay(null);
  }

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const doneRef = useRef(doneTasks);
  doneRef.current = doneTasks;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const openIdRef = useRef(openId);
  openIdRef.current = openId;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creating = useRef(false);

  // --- timer state (drawer only on this surface) ---
  const [running, setRunning] = useState<RunningTimer | null>(initialRunning);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNowTs(Date.now());
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  function elapsedLabel(startedAtIso: string): string {
    const s = Math.max(0, Math.floor((nowTs - new Date(startedAtIso).getTime()) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
      : `${m}:${String(ss).padStart(2, "0")}`;
  }
  async function toggleTimer(taskId: string) {
    if (running?.taskId === taskId) {
      setRunning(null);
      startTransition(async () => {
        const r = await stopTimer();
        if (!r.ok) flash(r.error ?? "Couldn't stop.");
        if (openIdRef.current === taskId) refreshSessions(taskId);
      });
    } else {
      setRunning({ taskId, sessionId: "pending", startedAt: new Date().toISOString() });
      setNowTs(Date.now());
      startTransition(async () => {
        const r = await startTimer(taskId);
        if (r.ok && r.session) {
          setRunning({ taskId, sessionId: r.session.id, startedAt: r.session.startedAt });
          if (openIdRef.current === taskId) refreshSessions(taskId);
        } else {
          setRunning(null);
          flash(r.error ?? "Couldn't start.");
        }
      });
    }
  }

  // --- sessions + activity for the open task ---
  const [sessions, setSessions] = useState<TimeSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  async function refreshSessions(taskId: string) {
    setSessionsLoading(true);
    const r = await listSessions(taskId);
    setSessionsLoading(false);
    if (r.ok) setSessions(r.sessions);
  }
  async function refreshActivity(taskId: string) {
    setActivityLoading(true);
    const r = await listActivity(taskId);
    setActivityLoading(false);
    if (r.ok) setActivity(r.activity);
  }
  useEffect(() => {
    if (openId && openId !== DRAFT) {
      refreshSessions(openId);
      refreshActivity(openId);
    } else {
      setSessions([]);
      setActivity([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);
  function onAddEntry() {
    const id = openIdRef.current;
    if (!id || id === DRAFT) return;
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 60000);
    startTransition(async () => {
      const r = await addSession(id, start.toISOString(), end.toISOString());
      if (r.ok) refreshSessions(id);
      else flash(r.error ?? "Couldn't add entry.");
    });
  }
  function onSessionPatch(
    id: string,
    patch: { startedAt?: string; endedAt?: string | null; note?: string | null }
  ) {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    startTransition(async () => {
      const r = await updateSession(id, patch);
      if (!r.ok) flash(r.error ?? "Couldn't save.");
    });
  }
  function onSessionDelete(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    startTransition(async () => {
      const r = await deleteSession(id);
      if (!r.ok) flash(r.error ?? "Couldn't delete.");
    });
  }

  const isNew = openId === DRAFT;
  const openTask = isNew
    ? draft
    : tasks.find((t) => t.id === openId) ?? doneTasks?.find((t) => t.id === openId) ?? null;
  const mitCount = tasks.filter((t) => t.mit && t.status !== "Done").length;

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  /** A task may live in the open list, the done list, or both — patch wherever it is. */
  function patchBoth(id: string, fn: (t: Task) => Task) {
    setTasks((prev) => prev.map((x) => (x.id === id ? fn(x) : x)));
    setDoneTasks((prev) => (prev ? prev.map((x) => (x.id === id ? fn(x) : x)) : prev));
  }
  function findTask(id: string): Task | undefined {
    return tasksRef.current.find((x) => x.id === id) ?? doneRef.current?.find((x) => x.id === id);
  }

  function toggleDone(t: Task) {
    const done = t.status !== "Done";
    // Reopening from the Done view: the task isn't in the open list yet.
    const addToOpen = !done && !tasksRef.current.some((x) => x.id === t.id);
    patchBoth(t.id, (x) => ({
      ...x,
      status: done ? "Done" : "To Do",
      completedAt: done ? new Date().toISOString() : undefined,
    }));
    if (addToOpen) setTasks((prev) => [...prev, { ...t, status: "To Do", completedAt: undefined }]);
    // Completing from an open view: surface it in the Done list too (if loaded).
    if (done)
      setDoneTasks((prev) =>
        prev && !prev.some((x) => x.id === t.id)
          ? [{ ...t, status: "Done", completedAt: new Date().toISOString() }, ...prev]
          : prev
      );
    startTransition(async () => {
      const r = await setTaskDone(t.id, done);
      if (!r.ok) {
        patchBoth(t.id, (x) => ({ ...x, status: t.status, completedAt: t.completedAt }));
        if (addToOpen) setTasks((prev) => prev.filter((x) => x.id !== t.id));
        flash(r.error ?? "Couldn't save.");
      } else if (openIdRef.current === t.id) {
        refreshActivity(t.id);
      }
    });
  }

  function toggleMit(t: Task) {
    const on = !t.mit;
    if (on && mitCount >= 3) {
      flash("You already have 3 protected — clear one first.");
      return;
    }
    patchBoth(t.id, (x) => ({ ...x, mit: on }));
    startTransition(async () => {
      const r = await updateTask(t.id, { mit: on });
      if (!r.ok) {
        patchBoth(t.id, (x) => ({ ...x, mit: t.mit }));
        flash(r.error ?? "Couldn't save.");
      }
    });
  }

  // discrete save (used by calendar drag-reschedule)
  function savePatch(id: string, patch: TaskPatch) {
    patchBoth(id, (x) => applyPatch(x, patch, today));
    startTransition(async () => {
      const r = await updateTask(id, patch);
      if (!r.ok) flash(r.error ?? "Couldn't save.");
    });
  }

  function scheduleUpdate(id: string) {
    setSaving(true);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const t = findTask(id);
      if (!t) return;
      startTransition(async () => {
        const r = await updateTask(id, fullPatch(t));
        setSaving(false);
        if (r.ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
          if (openIdRef.current === id) refreshActivity(id);
        } else flash(r.error ?? "Couldn't save.");
      });
    }, 450);
  }

  function scheduleCreateFromDraft() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const d = draftRef.current;
      if (!d || !d.title.trim() || creating.current) return;
      creating.current = true;
      setSaving(true);
      startTransition(async () => {
        const r = await createTask({ ...fullPatch(d), title: d.title.trim() });
        setSaving(false);
        creating.current = false;
        if (r.ok && r.task) {
          const created = r.task;
          setTasks((prev) => [created, ...prev]);
          setDraft(null);
          setOpenId(created.id);
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        } else flash(r.error ?? "Couldn't create.");
      });
    }, 500);
  }

  function onField(patch: TaskPatch) {
    if (patch.mit === true && openTask && !openTask.mit && mitCount >= 3) {
      flash("You already have 3 protected — clear one first.");
      return;
    }
    if (isNew) {
      setDraft((d) => (d ? applyPatch(d, patch, today) : d));
      scheduleCreateFromDraft();
    } else if (openId) {
      patchBoth(openId, (x) => applyPatch(x, patch, today));
      scheduleUpdate(openId);
    }
  }

  function openExisting(id: string) {
    setOpenId(id);
    setSaved(false);
    setSaving(false);
  }

  function openDraft() {
    setDraft({
      id: DRAFT,
      title: "",
      status: "To Do",
      domain: "Work",
      type: "Task",
      priority: 3,
      mit: false,
    });
    setOpenId(DRAFT);
    setSaved(false);
    setSaving(false);
  }

  function closeDrawer() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (isNew) {
      const d = draftRef.current;
      if (d && d.title.trim() && !creating.current) {
        creating.current = true;
        startTransition(async () => {
          const r = await createTask({ ...fullPatch(d), title: d.title.trim() });
          creating.current = false;
          if (r.ok && r.task) setTasks((prev) => [r.task!, ...prev]);
        });
      }
      setDraft(null);
    } else if (openId) {
      const t = findTask(openId);
      if (t) startTransition(async () => void (await updateTask(openId, fullPatch(t))));
    }
    setOpenId(null);
    setSaved(false);
  }

  function onDelete() {
    if (!openId || isNew) return;
    const id = openId;
    setOpenId(null);
    setTasks((prev) => prev.filter((x) => x.id !== id));
    setDoneTasks((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
    startTransition(async () => {
      const r = await deleteTask(id);
      if (!r.ok) flash(r.error ?? "Couldn't delete.");
    });
  }

  const quickParsed = quick.trim() ? parseQuickAdd(quick.trim(), today, matters) : null;

  function submitQuick() {
    if (!quick.trim()) return;
    const p = parseQuickAdd(quick.trim(), today, matters);
    setQuick("");
    startTransition(async () => {
      const r = await createTask({
        title: p.title,
        status: view === "someday" ? "Someday" : "To Do",
        doDate: p.doDate ?? null, // no date assumed here
        doTime: p.doTime ?? null,
        priority: p.priority,
        matterId: p.matterId ?? null,
      });
      if (r.ok && r.task) setTasks((prev) => [...prev, r.task!]);
      else flash(r.error ?? "Couldn't add.");
    });
  }

  // --- filtering + view assembly ---
  function matchesFilters(t: Task): boolean {
    if (fQ && !t.title.toLowerCase().includes(fQ.trim().toLowerCase())) return false;
    if (fMatter && t.matterId !== fMatter) return false;
    if (fPri && t.priority !== fPri) return false;
    if (fType && t.type !== fType) return false;
    if (fMit && !t.mit) return false;
    if (fFrom || fTo) {
      // The range means "completed between" on Done, "scheduled between" elsewhere.
      const d =
        view === "done"
          ? t.completedAt
            ? toISO(new Date(t.completedAt))
            : undefined
          : t.doDate;
      if (!d) return false;
      if (fFrom && d < fFrom) return false;
      if (fTo && d > fTo) return false;
    }
    return true;
  }
  const sourceTasks = view === "done" ? doneTasks ?? [] : tasks;
  const filtered = sourceTasks.filter(matchesFilters);
  const filtersActive = !!(fQ || fMatter || fPri || fType || fMit || fFrom || fTo);
  function clearFilters() {
    setFQ("");
    setFMatter("");
    setFPri(0);
    setFType("");
    setFMit(false);
    setFFrom("");
    setFTo("");
  }

  function dayHeading(iso: string): string {
    const d = daysFromToday(iso, today);
    const dt = fromISO(iso);
    const md = `${DOW[dt.getDay()]} · ${MONTHS_SHORT[dt.getMonth()]} ${dt.getDate()}`;
    if (d === 0) return `TODAY · ${md}`;
    if (d === 1) return `TOMORROW · ${md}`;
    return md;
  }

  function doneHeading(iso: string): string {
    const d = daysFromToday(iso, today);
    if (d === 0) return "COMPLETED TODAY";
    if (d === -1) return "YESTERDAY";
    const dt = fromISO(iso);
    const base = `${DOW[dt.getDay()]} · ${MONTHS_SHORT[dt.getMonth()]} ${dt.getDate()}`;
    return dt.getFullYear() === fromISO(today).getFullYear()
      ? base
      : `${base}, ${dt.getFullYear()}`;
  }

  function buildGroups(): Group[] {
    const active = (t: Task) => t.status !== "Someday";
    switch (view) {
      case "done": {
        const list = [...filtered].sort((a, b) =>
          (b.completedAt ?? "").localeCompare(a.completedAt ?? "")
        );
        const out: Group[] = [];
        for (const t of list) {
          const label = t.completedAt ? doneHeading(toISO(new Date(t.completedAt))) : "EARLIER";
          const last = out[out.length - 1];
          if (last && last.label === label) last.items.push(t);
          else out.push({ label, items: [t] });
        }
        return out;
      }
      case "triage": {
        const overdue = filtered
          .filter((t) => active(t) && t.doDate && daysFromToday(t.doDate, today) < 0)
          .sort(taskSort);
        const todayList = filtered.filter((t) => active(t) && t.doDate === today).sort(taskSort);
        return [
          { label: "OVERDUE", cls: "overdue", items: overdue },
          { label: "TODAY", items: todayList },
        ];
      }
      case "week": {
        const out: Group[] = [];
        for (let i = 0; i <= 6; i++) {
          const iso = toISO(new Date(fromISO(today).getTime() + i * 86400000));
          const items = filtered.filter((t) => active(t) && t.doDate === iso).sort(taskSort);
          if (items.length || i === 0)
            out.push({ label: dayHeading(iso), items });
        }
        const overdue = filtered
          .filter((t) => active(t) && t.doDate && daysFromToday(t.doDate, today) < 0)
          .sort(taskSort);
        if (overdue.length) out.unshift({ label: "OVERDUE", cls: "overdue", items: overdue });
        return out;
      }
      case "deadlines": {
        const dls = filtered.filter((t) => t.type === "Deadline").sort(taskSort);
        const overdue = dls.filter((t) => t.doDate && daysFromToday(t.doDate, today) < 0);
        const upcoming = dls.filter((t) => !t.doDate || daysFromToday(t.doDate, today) >= 0);
        const byMonth = new Map<string, Task[]>();
        for (const t of upcoming) {
          const key = t.doDate
            ? `${MONTHS_FULL[fromISO(t.doDate).getMonth()].toUpperCase()} ${fromISO(t.doDate).getFullYear()}`
            : "NO DATE";
          byMonth.set(key, [...(byMonth.get(key) ?? []), t]);
        }
        const out: Group[] = [];
        if (overdue.length) out.push({ label: "OVERDUE", cls: "overdue", items: overdue });
        for (const [label, items] of byMonth) out.push({ label, items });
        return out;
      }
      case "unscheduled":
        return [
          {
            label: "NO DATE",
            items: filtered.filter((t) => active(t) && !t.doDate).sort(prioritySort),
          },
        ];
      case "someday":
        return [
          {
            label: "SOMEDAY",
            items: filtered.filter((t) => t.status === "Someday").sort(prioritySort),
          },
        ];
      case "all":
      default: {
        const defs: { label: string; cls?: string; test: (t: Task) => boolean }[] = [
          {
            label: "OVERDUE",
            cls: "overdue",
            test: (t) => active(t) && !!t.doDate && daysFromToday(t.doDate, today) < 0,
          },
          { label: "TODAY", test: (t) => active(t) && t.doDate === today },
          {
            label: "TOMORROW",
            test: (t) => active(t) && !!t.doDate && daysFromToday(t.doDate, today) === 1,
          },
          {
            label: "NEXT 7 DAYS",
            test: (t) => {
              if (!active(t) || !t.doDate) return false;
              const d = daysFromToday(t.doDate, today);
              return d >= 2 && d < 7;
            },
          },
          {
            label: "LATER",
            test: (t) => active(t) && !!t.doDate && daysFromToday(t.doDate, today) >= 7,
          },
          { label: "NO DATE", test: (t) => active(t) && !t.doDate },
          { label: "SOMEDAY", test: (t) => t.status === "Someday" },
        ];
        return defs.map((d) => ({
          label: d.label,
          cls: d.cls,
          items: filtered.filter(d.test).sort(taskSort),
        }));
      }
    }
  }

  function Meta({ t }: { t: Task }) {
    const pm = PRIORITY_META[t.priority];
    const scope = t.matterId
      ? matters.find((m) => m.id === t.matterId)?.name.toUpperCase() ?? t.domain.toUpperCase()
      : t.domain.toUpperCase();
    const kindCls =
      t.type === "Event" ? "kind-event" : t.type === "Deadline" ? "kind-deadline" : "kind-task";
    return (
      <div className="meta">
        <span className={`pri ${pm.cls}`}>{pm.label}</span>
        <span className="cat-dot" style={{ background: DOMAIN_DOT[t.domain] }} />
        <span className="meta-scope">{scope}</span>
        <span className={kindCls}>{t.type.toUpperCase()}</span>
        {t.dueTag && <span className="time-tag">{t.dueTag}</span>}
      </div>
    );
  }

  function fmtDoneTime(iso?: string): string | undefined {
    if (!iso) return undefined;
    const d = new Date(iso);
    let h = d.getHours();
    const m = d.getMinutes();
    const ap = h >= 12 ? "P" : "A";
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, "0")}${ap}`;
  }

  function Row({ t, stamp }: { t: Task; stamp?: string }) {
    const done = t.status === "Done";
    return (
      <div className="task-row">
        <button
          type="button"
          className={`check task-check${done ? " is-done" : ""}`}
          aria-label={done ? "Mark not done" : "Mark done"}
          onClick={() => toggleDone(t)}
        >
          {done ? "✓" : ""}
        </button>
        <div className="task-body clickable" onClick={() => openExisting(t.id)}>
          <div className={`task-title${done ? " is-done" : ""}`}>{t.title}</div>
          <Meta t={t} />
        </div>
        {stamp && <span className="done-at">{stamp}</span>}
        <button
          type="button"
          className={`mit-star${t.mit ? " is-on" : ""}`}
          title={t.mit ? "Unprotect (remove from Top-3)" : "Protect (add to Top-3)"}
          onClick={() => toggleMit(t)}
        >
          {t.mit ? "★" : "☆"}
        </button>
      </div>
    );
  }

  // --- calendar ---
  function calCells(): { iso: string; day: number; inMonth: boolean }[] {
    const first = new Date(calY, calM, 1);
    const start = new Date(calY, calM, 1 - first.getDay());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      cells.push({ iso: toISO(d), day: d.getDate(), inMonth: d.getMonth() === calM });
    }
    return cells;
  }
  const calTasks = filtered.filter((t) => t.status !== "Done" && t.doDate);
  const unscheduledChips = filtered
    .filter((t) => t.status !== "Done" && t.status !== "Someday" && !t.doDate)
    .sort(prioritySort);

  function chipKind(t: Task): string {
    return t.type === "Deadline" ? "k-deadline" : t.type === "Event" ? "k-event" : "k-task";
  }

  function Chip({ t }: { t: Task }) {
    return (
      <div
        className={`cal-chip ${chipKind(t)}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", t.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => openExisting(t.id)}
        title={t.title}
      >
        {t.doTime && <span className="cal-chip-time">{t.dueTag ?? t.doTime}</span>}
        {t.title}
      </div>
    );
  }

  function Calendar() {
    const cells = calCells();
    return (
      <div className="cal">
        <div className="cal-head">
          <div className="cal-title">
            {MONTHS_FULL[calM]} {calY}
          </div>
          <div className="cal-nav">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              ‹
            </button>
            <button
              type="button"
              onClick={() => {
                setCalY(fromISO(today).getFullYear());
                setCalM(fromISO(today).getMonth());
              }}
            >
              TODAY
            </button>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month">
              ›
            </button>
          </div>
        </div>

        {unscheduledChips.length > 0 && (
          <div className="cal-tray">
            <span className="cal-tray-label">UNSCHEDULED · DRAG ONTO A DAY</span>
            <div className="cal-tray-chips">
              {unscheduledChips.map((t) => (
                <Chip key={t.id} t={t} />
              ))}
            </div>
          </div>
        )}

        <div className="cal-grid">
          {DOW.map((d) => (
            <div key={d} className="cal-dow">
              {d}
            </div>
          ))}
          {cells.map((c) => {
            const items = calTasks.filter((t) => t.doDate === c.iso).sort(taskSort);
            const expanded = expandedDay === c.iso;
            const shown = expanded ? items : items.slice(0, 4);
            return (
              <div
                key={c.iso}
                className={`cal-cell${c.inMonth ? "" : " out"}${c.iso === today ? " is-today" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  const t = tasksRef.current.find((x) => x.id === id);
                  if (t && t.doDate !== c.iso) savePatch(id, { doDate: c.iso });
                }}
              >
                <div className="cal-day">{c.day}</div>
                {shown.map((t) => (
                  <Chip key={t.id} t={t} />
                ))}
                {!expanded && items.length > 4 && (
                  <button type="button" className="cal-more" onClick={() => setExpandedDay(c.iso)}>
                    +{items.length - 4} more
                  </button>
                )}
                {expanded && items.length > 4 && (
                  <button type="button" className="cal-more" onClick={() => setExpandedDay(null)}>
                    less
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // --- priority board ---
  function PriorityBoard() {
    const board = filtered.filter((t) => t.status !== "Someday");
    return (
      <div className="kb-board">
        {[1, 2, 3, 4].map((p) => {
          const items = board.filter((t) => t.priority === p).sort(taskSort);
          return (
            <div
              key={p}
              className="kb-col"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                const t = tasksRef.current.find((x) => x.id === id);
                if (t && t.priority !== p) savePatch(id, { priority: p });
              }}
            >
              <div className="kb-col-head" style={{ color: PRI_COLOR[p] }}>
                <span>{PRIORITY_META[p as 1 | 2 | 3 | 4].label}</span>
                <span className="kb-col-count">{items.filter((t) => t.status !== "Done").length}</span>
              </div>
              {items.map((t) => {
                const done = t.status === "Done";
                const scope = t.matterId
                  ? matters.find((m) => m.id === t.matterId)?.name ?? t.domain
                  : t.domain;
                return (
                  <div
                    key={t.id}
                    className={`kb-card${done ? " is-done" : ""}`}
                    style={{ borderLeftColor: PRI_COLOR[p] }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", t.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => openExisting(t.id)}
                  >
                    <div className={`kb-title${done ? " is-done" : ""}`}>
                      {t.mit && <span className="kb-mit">★ </span>}
                      {t.title}
                    </div>
                    <div className="kb-meta">
                      <span>{scope.toUpperCase()}</span>
                      {t.type !== "Task" && <span>{t.type.toUpperCase()}</span>}
                      {t.dueTag && <span className="kb-due">{t.dueTag}</span>}
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && <div className="kb-empty">—</div>}
            </div>
          );
        })}
      </div>
    );
  }

  const groups = view === "calendar" || view === "priorities" ? [] : buildGroups();
  const shownCount =
    view === "calendar" ? calTasks.length : groups.reduce((a, g) => a + g.items.length, 0);
  const openCount = tasks.filter((t) => t.status !== "Done").length;
  const overdueCount = tasks.filter(
    (t) =>
      t.status !== "Done" &&
      t.status !== "Someday" &&
      t.doDate &&
      daysFromToday(t.doDate, today) < 0
  ).length;

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">ACTION</div>
            <h1 className="display-h1">Tasks</h1>
          </div>
          <div className="day-head-summary">
            {openCount} OPEN{overdueCount > 0 ? ` · ${overdueCount} OVERDUE` : ""}
          </div>
        </div>

        <div className="capture-row">
          <input
            className="quick-add"
            placeholder="+  Add a task…  (try: “file reply brief smith p1 next friday”)"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitQuick();
            }}
          />
          <button className="btn-add" type="button" onClick={() => openDraft()}>
            + Task
          </button>
        </div>
        {quickParsed &&
          (quickParsed.dateLabel ||
            quickParsed.timeLabel ||
            quickParsed.priority ||
            quickParsed.matterLabel) && (
            <div className="quick-parse-hint">
              ↳ {quickParsed.title || "…"}
              {quickParsed.dateLabel && <span className="qp-chip"> · {quickParsed.dateLabel}</span>}
              {quickParsed.timeLabel && <span className="qp-chip"> · {quickParsed.timeLabel}</span>}
              {quickParsed.priority && (
                <span className="qp-chip" style={{ color: PRI_COLOR[quickParsed.priority] }}>
                  {" "}
                  · P{quickParsed.priority}
                </span>
              )}
              {quickParsed.matterLabel && (
                <span className="qp-chip"> · {quickParsed.matterLabel}</span>
              )}
            </div>
          )}

        <div className="view-pills">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              className={`view-pill${view === v.key ? " is-active" : ""}`}
              onClick={() => setView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="filter-bar">
          <input
            className="filter-input"
            placeholder="Search…"
            value={fQ}
            onChange={(e) => setFQ(e.target.value)}
          />
          <select className="dw-select" value={fMatter} onChange={(e) => setFMatter(e.target.value)}>
            <option value="">Any case</option>
            {matters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            className="dw-select"
            value={fPri}
            onChange={(e) => setFPri(Number(e.target.value))}
          >
            <option value={0}>Any priority</option>
            {[1, 2, 3, 4].map((p) => (
              <option key={p} value={p}>
                P{p}
              </option>
            ))}
          </select>
          <select className="dw-select" value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">Any type</option>
            <option value="Task">Task</option>
            <option value="Event">Event</option>
            <option value="Deadline">Deadline</option>
          </select>
          <input
            type="date"
            className="filter-date"
            value={fFrom}
            onChange={(e) => setFFrom(e.target.value)}
            title={view === "done" ? "Completed from" : "Scheduled from"}
          />
          <span className="dw-dash">–</span>
          <input
            type="date"
            className="filter-date"
            value={fTo}
            onChange={(e) => setFTo(e.target.value)}
            title={view === "done" ? "Completed through" : "Scheduled through"}
          />
          <button
            type="button"
            className={`filter-mit${fMit ? " is-on" : ""}`}
            title="Only protected (Top-3) tasks"
            onClick={() => setFMit((v) => !v)}
          >
            ★ MIT
          </button>
          {filtersActive && (
            <button type="button" className="filter-clear" onClick={clearFilters}>
              Clear
            </button>
          )}
        </div>

        {view === "calendar" ? (
          <Calendar />
        ) : view === "priorities" ? (
          <PriorityBoard />
        ) : (
          <>
            {groups.map(
              (g) =>
                (g.items.length > 0 || view === "triage" || view === "week") && (
                  <div key={g.label}>
                    {!(g.items.length === 0 && g.cls === "overdue") && (
                      <div className={`section-label${g.cls ? ` ${g.cls}` : ""}`}>
                        {g.label} · {g.items.length}
                      </div>
                    )}
                    {g.items.map((t) => (
                      <Row
                        key={t.id}
                        t={t}
                        stamp={view === "done" ? fmtDoneTime(t.completedAt) : undefined}
                      />
                    ))}
                  </div>
                )
            )}
            {shownCount === 0 && !doneLoading && (
              <div className="empty-note">
                {filtersActive
                  ? "Nothing matches these filters."
                  : view === "done"
                    ? "Nothing completed in this window."
                    : "Nothing here. Capture something above."}
              </div>
            )}
            {view === "done" && (
              <div className="done-window">
                {doneLoading
                  ? "LOADING…"
                  : doneDays
                    ? `SHOWING LAST ${doneDays} DAYS`
                    : "SHOWING ALL TIME"}
                {!doneLoading && doneDays !== 0 && (
                  <button
                    type="button"
                    className="filter-clear"
                    onClick={() => setDoneDays(doneDays === 30 ? 90 : 0)}
                  >
                    Show older
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {openTask && (
        <TaskDrawer
          task={openTask}
          matters={matters}
          mitCount={mitCount}
          saving={saving}
          saved={saved}
          isNew={isNew}
          onField={onField}
          onDelete={onDelete}
          onClose={closeDrawer}
          sessions={sessions}
          sessionsLoading={sessionsLoading}
          isRunning={!isNew && running?.taskId === openTask.id}
          liveElapsed={
            !isNew && running?.taskId === openTask.id ? elapsedLabel(running.startedAt) : null
          }
          onStartStop={() => !isNew && toggleTimer(openTask.id)}
          onAddEntry={onAddEntry}
          onSessionPatch={onSessionPatch}
          onSessionDelete={onSessionDelete}
          onMarkComplete={() => {
            const t = findTask(openTask.id);
            if (t) toggleDone(t);
          }}
          activity={activity}
          activityLoading={activityLoading}
        />
      )}

      {error && <div className="toast">{error}</div>}
    </>
  );
}
