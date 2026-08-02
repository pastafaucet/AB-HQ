"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type {
  Task,
  Matter,
  Domain,
  TaskStatus,
  TaskType,
  Priority,
  RunningTimer,
  TimeSession,
} from "@/lib/data";
import { PRIORITY_META, DOMAIN_DOT, DAY_START_HOUR, DAY_END_HOUR } from "@/lib/data";
import { dueTagFor } from "@/lib/task-map";
import {
  setTaskDone,
  updateTask,
  createTask,
  deleteTask,
  type TaskPatch,
} from "@/app/(app)/task-actions";
import {
  startTimer,
  stopTimer,
  listSessions,
  updateSession,
  deleteSession,
} from "@/app/(app)/time-actions";
import TaskDrawer from "./TaskDrawer";
import CapacityBar from "./CapacityBar";
import ScheduleGrid, { type SchedItem } from "./ScheduleGrid";

const DRAFT = "draft";
const PRI_COLOR: Record<number, string> = { 1: "#e0665a", 2: "#5fbf8f", 3: "#d8a657", 4: "#6f7787" };

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function minToHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function applyPatch(t: Task, p: TaskPatch, today: string): Task {
  const next: Task = { ...t };
  if (p.title !== undefined) next.title = p.title;
  if (p.priority !== undefined) next.priority = p.priority as Priority;
  if (p.mit !== undefined) next.mit = p.mit;
  if (p.status !== undefined) next.status = p.status as TaskStatus;
  if (p.domain !== undefined) next.domain = p.domain as Domain;
  if (p.type !== undefined) next.type = p.type as TaskType;
  if (p.matterId !== undefined) next.matterId = p.matterId ?? undefined;
  if (p.doDate !== undefined) next.doDate = p.doDate ?? undefined;
  if (p.doTime !== undefined) next.doTime = p.doTime ?? undefined;
  if (p.durationMin !== undefined) next.durationMin = p.durationMin ?? undefined;
  if (p.notes !== undefined) next.notes = p.notes ?? undefined;
  if (p.doDate !== undefined || p.doTime !== undefined) {
    next.dueTag = dueTagFor(next.doDate ?? null, next.doTime ?? null, today);
  }
  return next;
}

function fullPatch(t: Task): TaskPatch {
  return {
    title: t.title,
    priority: t.priority,
    mit: t.mit,
    status: t.status,
    domain: t.domain,
    type: t.type,
    matterId: t.matterId ?? null,
    doDate: t.doDate ?? null,
    doTime: t.doTime ?? null,
    durationMin: t.durationMin ?? null,
    notes: t.notes ?? null,
  };
}

export default function MyDayClient({
  initialTasks,
  matters,
  today,
  dateLabel,
  initialRunning,
}: {
  initialTasks: Task[];
  matters: Matter[];
  today: string;
  dateLabel: string;
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

  // --- persisted time tracker (DB-backed, cross-device) ---
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

  // --- sessions for the currently open task ---
  const [sessions, setSessions] = useState<TimeSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  async function refreshSessions(taskId: string) {
    setSessionsLoading(true);
    const r = await listSessions(taskId);
    setSessionsLoading(false);
    if (r.ok) setSessions(r.sessions);
  }
  useEffect(() => {
    if (openId && openId !== DRAFT) refreshSessions(openId);
    else setSessions([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);
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

  const mits = tasks.filter((t) => t.mit);
  const inProgress = tasks.filter((t) => !t.mit && t.status === "In Progress");
  const alsoToday = tasks.filter(
    (t) => !t.mit && t.status !== "In Progress" && t.doDate === today
  );
  const mitSlots = [0, 1, 2].map((i) => mits[i] ?? null);
  const mitsDone = mits.filter((t) => t.status === "Done").length;
  const openCount = alsoToday.length + inProgress.length;

  // --- schedule items: tasks with a time, on today ---
  const mitNum: Record<string, number> = {};
  mits.forEach((t, i) => (mitNum[t.id] = i + 1));
  const schedItems: SchedItem[] = tasks
    .filter((t) => t.doTime && t.doDate === today)
    .map((t) => ({
      id: t.id,
      title: t.title,
      sub: t.matterId ? matters.find((m) => m.id === t.matterId)?.name : undefined,
      startMin: toMin(t.doTime as string),
      durMin: t.durationMin ?? 60,
      kind: (t.type === "Event" ? "event" : t.mit ? "focus" : "task") as SchedItem["kind"],
      num: t.mit ? mitNum[t.id] : undefined,
      dot: t.type === "Event" ? DOMAIN_DOT[t.domain] : undefined,
      done: t.status === "Done",
      canTimer: t.type !== "Deadline",
    }))
    .sort((a, b) => a.startMin - b.startMin);

  // --- capacity, computed from today's timed tasks ---
  const timedToday = tasks.filter((t) => t.doTime && t.doDate === today);
  const sumH = (pred: (t: Task) => boolean) =>
    timedToday.filter(pred).reduce((a, t) => a + (t.durationMin ?? 60), 0) / 60;
  const meetingsH = sumH((t) => t.type === "Event");
  const focusH = sumH((t) => t.type === "Task");
  const windowH = DAY_END_HOUR - DAY_START_HOUR;
  const slackH = Math.max(0, windowH - meetingsH - focusH);
  const booked = meetingsH + focusH;
  const ratio = windowH ? booked / windowH : 0;
  const capNote =
    booked === 0
      ? "wide open"
      : ratio >= 0.7
        ? "heavy day"
        : ratio >= 0.4
          ? "a full plate"
          : "room to think";
  const capacity = { meetings: meetingsH, focus: focusH, slack: slackH, note: capNote };

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  function toggleDone(t: Task) {
    const done = t.status !== "Done";
    setTasks((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, status: done ? "Done" : "To Do" } : x))
    );
    startTransition(async () => {
      const r = await setTaskDone(t.id, done);
      if (!r.ok) {
        setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
        flash(r.error ?? "Couldn't save.");
      }
    });
  }

  // discrete save (used by schedule reschedule/unschedule)
  function savePatch(id: string, patch: TaskPatch) {
    setTasks((prev) => prev.map((x) => (x.id === id ? applyPatch(x, patch, today) : x)));
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
      const t = tasksRef.current.find((x) => x.id === id);
      if (!t) return;
      startTransition(async () => {
        const r = await updateTask(id, fullPatch(t));
        setSaving(false);
        if (r.ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
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
    if (patch.mit === true && openTask && !openTask.mit && mits.length >= 3) {
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

  function openDraft(prefill?: Partial<Task>) {
    setDraft({
      id: DRAFT,
      title: "",
      status: "To Do",
      domain: "Work",
      type: "Task",
      priority: 3,
      mit: false,
      doDate: today,
      ...prefill,
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

  function submitQuick() {
    const title = quick.trim();
    if (!title) return;
    setQuick("");
    startTransition(async () => {
      const r = await createTask({ title, status: "To Do", doDate: today });
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

  function Check({ t, className }: { t: Task; className: string }) {
    const done = t.status === "Done";
    return (
      <button
        type="button"
        className={`check ${className}${done ? " is-done" : ""}`}
        aria-label={done ? "Mark not done" : "Mark done"}
        onClick={() => toggleDone(t)}
      >
        {done ? "✓" : ""}
      </button>
    );
  }

  function Timer({ t }: { t: Task }) {
    if (t.type === "Deadline") return null;
    const isRunning = running?.taskId === t.id;
    return (
      <button
        type="button"
        className={`timer-btn${isRunning ? " running" : ""}`}
        title={isRunning ? "Stop timer" : "Start timer"}
        onClick={(e) => {
          e.stopPropagation();
          toggleTimer(t.id);
        }}
      >
        {isRunning && running && (
          <span className="timer-elapsed">{elapsedLabel(running.startedAt)}</span>
        )}
        <span className="timer-glyph">{isRunning ? "⏹" : "▶"}</span>
      </button>
    );
  }

  function Row({ t }: { t: Task }) {
    const done = t.status === "Done";
    return (
      <div className="task-row">
        <Check t={t} className="task-check" />
        <div className="task-body clickable" onClick={() => openExisting(t.id)}>
          <div className={`task-title${done ? " is-done" : ""}`}>{t.title}</div>
          <Meta t={t} />
        </div>
        <Timer t={t} />
      </div>
    );
  }

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">MY DAY</div>
            <h1 className="display-h1">{dateLabel}</h1>
          </div>
          <div className="day-head-summary">
            {openCount} OPEN · {mitsDone}/{mits.length} MIT DONE
          </div>
        </div>

        <div className="capture-row">
          <input
            className="quick-add"
            placeholder="+  Add a task…"
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

        <div className="section-label tight">
          TODAY&rsquo;S 3 · {mitsDone}/{mits.length} DONE
        </div>
        <div className="mit-list">
          {mitSlots.map((t, i) =>
            t ? (
              <div
                key={t.id}
                className={`mit-row${t.status === "Done" ? " is-done" : ""}`}
                style={{ borderLeftColor: PRI_COLOR[t.priority] }}
              >
                <Check t={t} className="mit-check-left" />
                <div className="mit-num">{i + 1}</div>
                <div className="mit-body clickable" onClick={() => openExisting(t.id)}>
                  <div className={`mit-title${t.status === "Done" ? " is-done" : ""}`}>
                    {t.title}
                  </div>
                  <Meta t={t} />
                </div>
                <Timer t={t} />
              </div>
            ) : (
              <button
                key={`empty-${i}`}
                className="mit-empty clickable-slot"
                onClick={() => openDraft({ mit: true })}
              >
                <div className="mit-empty-num">{i + 1}</div>
                <div className="mit-empty-text">Protect a task for slot {i + 1}</div>
              </button>
            )
          )}
        </div>

        <div className="section-label">ALSO TODAY · {alsoToday.length}</div>
        {alsoToday.map((t) => (
          <Row key={t.id} t={t} />
        ))}
        {alsoToday.length === 0 && <div className="empty-note">Nothing else queued for today.</div>}

        <div className="section-label">IN PROGRESS · {inProgress.length}</div>
        {inProgress.map((t) => (
          <Row key={t.id} t={t} />
        ))}
        {inProgress.length === 0 && <div className="empty-note">Nothing in progress.</div>}

        <div className="open-note">{openCount} OPEN · KEEP THE THREE PROTECTED.</div>
      </section>

      <aside className="rail">
        <CapacityBar data={capacity} />
        <ScheduleGrid
          items={schedItems}
          runningId={running?.taskId ?? null}
          elapsed={running ? elapsedLabel(running.startedAt) : ""}
          onOpen={openExisting}
          onToggle={(id) => {
            const t = tasksRef.current.find((x) => x.id === id);
            if (t) toggleDone(t);
          }}
          onTimer={toggleTimer}
          onUnschedule={(id) => savePatch(id, { doTime: null })}
          onReschedule={(id, startMin) => savePatch(id, { doTime: minToHHMM(startMin) })}
        />
      </aside>

      {openTask && (
        <TaskDrawer
          task={openTask}
          matters={matters}
          mitCount={mits.length}
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
          onSessionPatch={onSessionPatch}
          onSessionDelete={onSessionDelete}
        />
      )}

      {error && <div className="toast">{error}</div>}
    </>
  );
}
