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

function daysFromToday(iso: string, todayIso: string): number {
  const [y1, m1, d1] = todayIso.split("-").map(Number);
  const [y2, m2, d2] = iso.split("-").map(Number);
  return Math.round(
    (new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86400000
  );
}

type GroupKey = "overdue" | "today" | "tomorrow" | "week" | "later" | "nodate" | "someday";

const GROUP_ORDER: { key: GroupKey; label: string }[] = [
  { key: "overdue", label: "OVERDUE" },
  { key: "today", label: "TODAY" },
  { key: "tomorrow", label: "TOMORROW" },
  { key: "week", label: "NEXT 7 DAYS" },
  { key: "later", label: "LATER" },
  { key: "nodate", label: "NO DATE" },
  { key: "someday", label: "SOMEDAY" },
];

function groupOf(t: Task, today: string): GroupKey {
  if (t.status === "Someday") return "someday";
  if (!t.doDate) return "nodate";
  const d = daysFromToday(t.doDate, today);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d < 7) return "week";
  return "later";
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

export default function TasksClient({
  initialTasks,
  matters,
  today,
  initialRunning,
}: {
  initialTasks: Task[];
  matters: Matter[];
  today: string;
  initialRunning: RunningTimer | null;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [draft, setDraft] = useState<Task | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [quick, setQuick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
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
  const openTask = isNew ? draft : tasks.find((t) => t.id === openId) ?? null;
  const mitCount = tasks.filter((t) => t.mit).length;

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  function toggleDone(t: Task) {
    const done = t.status !== "Done";
    // Done tasks leave this surface; keep it visible until the drawer closes.
    setTasks((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, status: done ? "Done" : "To Do" } : x))
    );
    startTransition(async () => {
      const r = await setTaskDone(t.id, done);
      if (!r.ok) {
        setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
        flash(r.error ?? "Couldn't save.");
      } else if (openIdRef.current === t.id) {
        refreshActivity(t.id);
      }
    });
  }

  function scheduleUpdate(id: string) {
    setSaving(true);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const t = tasksRef.current.find((x) => x.id === id);
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
      setTasks((prev) => prev.map((x) => (x.id === openId ? applyPatch(x, patch, today) : x)));
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
      const t = tasksRef.current.find((x) => x.id === openId);
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
        status: "To Do",
        doDate: p.doDate ?? null, // no date assumed here — undated lands in NO DATE
        doTime: p.doTime ?? null,
        priority: p.priority,
        matterId: p.matterId ?? null,
      });
      if (r.ok && r.task) setTasks((prev) => [...prev, r.task!]);
      else flash(r.error ?? "Couldn't add.");
    });
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

  function Row({ t }: { t: Task }) {
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
        {t.mit && (
          <span className="row-mit-flag" title="Protected (Top-3)">
            ★
          </span>
        )}
      </div>
    );
  }

  // Done tasks stay visible (struck through) until the next page load.
  const groups = GROUP_ORDER.map((g) => ({
    ...g,
    items: tasks.filter((t) => groupOf(t, today) === g.key).sort(taskSort),
  }));
  const openCount = tasks.filter((t) => t.status !== "Done").length;
  const overdueCount = groups.find((g) => g.key === "overdue")?.items.length ?? 0;

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">ACTION</div>
            <h1 className="display-h1">All Tasks</h1>
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

        {groups.map(
          (g) =>
            g.items.length > 0 && (
              <div key={g.key}>
                <div className={`section-label${g.key === "overdue" ? " overdue" : ""}`}>
                  {g.label} · {g.items.length}
                </div>
                {g.items.map((t) => (
                  <Row key={t.id} t={t} />
                ))}
              </div>
            )
        )}
        {openCount === 0 && (
          <div className="empty-note">Nothing open. Capture something above.</div>
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
            const t = tasksRef.current.find((x) => x.id === openTask.id);
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
