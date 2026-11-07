"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Task, Matter, Project, RunningTimer, TimeSession, ActivityItem } from "@/lib/data";
import { applyPatch, fullPatch } from "@/lib/task-patch";
import { todayISO } from "@/lib/task-map";
import {
  updateTask,
  deleteTask,
  setTaskDone,
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
import TaskDrawer from "../TaskDrawer";
import { emitChange } from "./bus";

function elapsed(startedAtIso: string, nowTs: number): string {
  const s = Math.max(0, Math.floor((nowTs - new Date(startedAtIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
    : `${m}:${String(ss).padStart(2, "0")}`;
}

/**
 * A task drawer with its own saving, timer and history wiring, for the drawer
 * host. (The task screens still wire their own drawers; they move onto this
 * as each is next reworked.)
 */
export default function TaskDrawerContainer({
  task,
  matters,
  projects,
  mitCount,
  running: initialRunning,
  onClose,
}: {
  task: Task;
  matters: Matter[];
  projects: Project[];
  mitCount: number;
  running: RunningTimer | null;
  onClose: () => void;
}) {
  const today = todayISO();
  const [row, setRow] = useState<Task>(task);
  const rowRef = useRef(row);
  useEffect(() => {
    rowRef.current = row;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sessions, setSessions] = useState<TimeSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [running, setRunning] = useState<RunningTimer | null>(initialRunning);
  const [nowTs, setNowTs] = useState(() => Date.now());

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  async function refreshSessions() {
    const r = await listSessions(task.id);
    setSessionsLoading(false);
    if (r.ok) setSessions(r.sessions);
  }
  async function refreshActivity() {
    const r = await listActivity(task.id);
    setActivityLoading(false);
    if (r.ok) setActivity(r.activity);
  }

  useEffect(() => {
    let live = true;
    (async () => {
      const [s, a] = await Promise.all([listSessions(task.id), listActivity(task.id)]);
      if (!live) return;
      setSessionsLoading(false);
      setActivityLoading(false);
      if (s.ok) setSessions(s.sessions);
      if (a.ok) setActivity(a.activity);
    })();
    return () => {
      live = false;
    };
  }, [task.id]);

  const isRunning = running?.taskId === task.id;
  useEffect(() => {
    if (!isRunning) return;
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isRunning]);

  function commit(next: Task) {
    rowRef.current = next;
    setRow(next);
    emitChange({ kind: "task", id: next.id, row: next });
  }

  function onField(patch: TaskPatch) {
    if (patch.mit === true && !rowRef.current.mit && mitCount >= 3) {
      flash("You already have 3 protected — clear one first.");
      return;
    }
    commit(applyPatch(rowRef.current, patch, today));
    setSaving(true);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const t = rowRef.current;
      startTransition(async () => {
        const r = await updateTask(t.id, fullPatch(t));
        setSaving(false);
        if (r.ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
          refreshActivity();
        } else flash(r.error ?? "Couldn't save.");
      });
    }, 450);
  }

  function close() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      const t = rowRef.current;
      startTransition(async () => void (await updateTask(t.id, fullPatch(t))));
    }
    onClose();
  }

  function onDelete() {
    const id = rowRef.current.id;
    emitChange({ kind: "task", id, deleted: true });
    onClose();
    startTransition(async () => {
      await deleteTask(id);
    });
  }

  function onMarkComplete() {
    const cur = rowRef.current;
    const done = cur.status !== "Done";
    commit({ ...cur, status: done ? "Done" : "To Do" });
    startTransition(async () => {
      const r = await setTaskDone(cur.id, done);
      if (!r.ok) flash(r.error ?? "Couldn't save.");
      else refreshActivity();
    });
  }

  function onStartStop() {
    if (isRunning) {
      setRunning(null);
      startTransition(async () => {
        const r = await stopTimer();
        if (!r.ok) flash(r.error ?? "Couldn't stop.");
        refreshSessions();
      });
    } else {
      setRunning({ taskId: task.id, sessionId: "pending", startedAt: new Date().toISOString() });
      setNowTs(Date.now());
      startTransition(async () => {
        const r = await startTimer(task.id);
        if (r.ok && r.session) {
          setRunning({ taskId: task.id, sessionId: r.session.id, startedAt: r.session.startedAt });
          refreshSessions();
        } else {
          setRunning(null);
          flash(r.error ?? "Couldn't start.");
        }
      });
    }
  }

  function onAddEntry() {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 60000);
    startTransition(async () => {
      const r = await addSession(task.id, start.toISOString(), end.toISOString());
      if (r.ok) refreshSessions();
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

  return (
    <>
      <TaskDrawer
        task={row}
        matters={matters}
        projects={projects}
        mitCount={mitCount}
        saving={saving}
        saved={saved}
        isNew={false}
        onField={onField}
        onDelete={onDelete}
        onClose={close}
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        isRunning={isRunning}
        liveElapsed={isRunning && running ? elapsed(running.startedAt, nowTs) : null}
        onStartStop={onStartStop}
        onAddEntry={onAddEntry}
        onSessionPatch={onSessionPatch}
        onSessionDelete={onSessionDelete}
        onMarkComplete={onMarkComplete}
        activity={activity}
        activityLoading={activityLoading}
      />
      {error && <div className="toast">{error}</div>}
    </>
  );
}
