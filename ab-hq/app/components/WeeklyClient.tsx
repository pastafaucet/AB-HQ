"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Task, RunningTimer, TimeSession, ActivityItem } from "@/lib/data";
import { PRIORITY_META, DOMAIN_DOT } from "@/lib/data";
import type { WeeklyReviewData } from "@/lib/queries";
import { applyPatch, fullPatch } from "@/lib/task-patch";
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
import TaskDrawer from "./TaskDrawer";
import { openCapture } from "./CaptureOverlay";

const MONTHS_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
const DOW1 = ["S", "M", "T", "W", "T", "F", "S"];

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}

export default function WeeklyClient({ data }: { data: WeeklyReviewData }) {
  const router = useRouter();
  const { today, matters, projects } = data;
  const [tasks, setTasks] = useState<Task[]>(() => {
    const seen = new Set<string>();
    return [...data.dueTasks, ...data.waitingTasks].filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  });
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  // --- drawer wiring (shared pattern) ---
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const openIdRef = useRef(openId);
  openIdRef.current = openId;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [running, setRunning] = useState<RunningTimer | null>(data.running);
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
  function toggleTimer(taskId: string) {
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
    if (openId) {
      refreshSessions(openId);
      refreshActivity(openId);
    } else {
      setSessions([]);
      setActivity([]);
    }
  }, [openId]);

  const openTask = tasks.find((t) => t.id === openId) ?? null;

  function openExisting(id: string) {
    setOpenId(id);
    setSaved(false);
    setSaving(false);
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
  function onField(patch: TaskPatch) {
    if (!openId) return;
    setTasks((prev) => prev.map((x) => (x.id === openId ? applyPatch(x, patch, today) : x)));
    scheduleUpdate(openId);
  }
  function closeDrawer() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (openId) {
      const t = tasksRef.current.find((x) => x.id === openId);
      if (t) startTransition(async () => void (await updateTask(openId, fullPatch(t))));
    }
    setOpenId(null);
    setSaved(false);
  }
  function onDeleteTask() {
    if (!openId) return;
    const id = openId;
    setOpenId(null);
    setTasks((prev) => prev.filter((x) => x.id !== id));
    startTransition(async () => {
      const r = await deleteTask(id);
      if (!r.ok) flash(r.error ?? "Couldn't delete.");
    });
  }
  function onMarkComplete() {
    if (!openTask) return;
    const t = openTask;
    const done = t.status !== "Done";
    setTasks((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, status: done ? "Done" : "To Do" } : x))
    );
    startTransition(async () => {
      const r = await setTaskDone(t.id, done);
      if (!r.ok) flash(r.error ?? "Couldn't save.");
      else if (openIdRef.current === t.id) refreshActivity(t.id);
    });
  }
  function onAddEntry() {
    const id = openIdRef.current;
    if (!id) return;
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

  const matterName = (id?: string) => (id ? matters.find((m) => m.id === id)?.name : undefined);
  const projectName = (id?: string) => (id ? projects.find((p) => p.id === id)?.name : undefined);

  function daysOut(iso: string): string {
    const d = Math.round(
      (new Date(`${iso}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000
    );
    return d === 0 ? "today" : d === 1 ? "tmrw" : `${d}d`;
  }

  function Meta({ t }: { t: Task }) {
    const pm = PRIORITY_META[t.priority];
    const kindCls =
      t.type === "Event" ? "kind-event" : t.type === "Deadline" ? "kind-deadline" : "kind-task";
    return (
      <div className="meta">
        <span className={`pri ${pm.cls}`}>{pm.label}</span>
        <span className="cat-dot" style={{ background: DOMAIN_DOT[t.domain] }} />
        <span className="meta-scope">{(matterName(t.matterId) ?? t.domain).toUpperCase()}</span>
        {projectName(t.projectId) && (
          <span className="meta-project">{projectName(t.projectId)!.toUpperCase()}</span>
        )}
        <span className={kindCls}>{t.type.toUpperCase()}</span>
        {t.recur && <span className="kind-event" title="Repeats">↻</span>}
      </div>
    );
  }

  // Merge due tasks (live) + markers, chronological with time/priority within day.
  type Row =
    | { key: string; sort: string; task: Task }
    | { key: string; sort: string; marker: WeeklyReviewData["dueMarkers"][0] };
  const liveDue = tasks.filter(
    (t) => t.status !== "Done" && t.doDate && t.doDate >= today
  );
  const rows: Row[] = [
    ...liveDue.map((t) => ({
      key: t.id,
      sort: `${t.doDate}T${t.doTime ?? "99:99"}P${t.priority}`,
      task: t,
    })),
    ...data.dueMarkers.map((m, i) => ({ key: `mk-${i}`, sort: `${m.date}T98:99P0`, marker: m })),
  ].sort((a, b) => (a.sort < b.sort ? -1 : 1));

  const liveWaiting = tasks.filter((t) => t.status !== "Done" && t.waitingOn);
  const buckets = ["Chris", "Opposing Counsel", "Court", "Other"].filter((b) =>
    liveWaiting.some((w) => w.waitingOn === b)
  );

  const lb = data.lookback;

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">REVIEWS · WEEK OF {fmtDate(data.weekDates[0])}</div>
            <h1 className="display-h1">The whole book.</h1>
          </div>
          <div className="day-head-summary">{data.activeMatters} ACTIVE MATTERS</div>
        </div>

        <div className="section-label tight">THE WEEK THAT WAS</div>
        <div className="wk-glance">
          <div className="wk-stat">
            <div className="wk-stat-num">{lb.done}</div>
            <div className="wk-stat-label">TASKS DONE</div>
          </div>
          <div className="wk-stat">
            <div className="wk-stat-num">{(lb.tenthsTotal / 10).toFixed(1)}h</div>
            <div className="wk-stat-label">BILLED TIME ENTERED</div>
          </div>
          <div className="wk-stat">
            <div className="wk-stat-num">{lb.captured}</div>
            <div className="wk-stat-label">CAPTURES</div>
          </div>
          <div className="wk-stat">
            <div className="wk-stat-num">{lb.touchedMatters}</div>
            <div className="wk-stat-label">MATTERS TOUCHED</div>
          </div>
        </div>
        {lb.byMatter.length > 0 && (
          <div className="wk-bymatter">
            {lb.byMatter.map((m) => (
              <div key={m.name} className="wk-bymatter-row">
                <span className="wk-bymatter-name">{m.name}</span>
                <span className="wk-bymatter-bar">
                  <span
                    className="wk-bymatter-fill"
                    style={{
                      width: `${Math.round((m.tenths / (lb.byMatter[0].tenths || 1)) * 100)}%`,
                    }}
                  />
                </span>
                <span className="wk-bymatter-tenths">{(m.tenths / 10).toFixed(1)}h</span>
              </div>
            ))}
          </div>
        )}

        <div className="section-label">DUE IN THE NEXT 30 DAYS · {rows.length}</div>
        {rows.map((r) => {
          if ("marker" in r) {
            return (
              <div
                key={r.key}
                className="wk-due-row clickable"
                onClick={() =>
                  router.push(r.marker.kind === "project" ? "/work/projects" : "/work/cases")
                }
              >
                <span className="wk-due-date is-near">
                  {fmtDate(r.marker.date)}
                  <span className="wk-due-in">{daysOut(r.marker.date)}</span>
                </span>
                <div className="task-body">
                  <div className="task-title">{r.marker.title}</div>
                  <div className="meta">
                    <span className="kind-deadline">
                      {r.marker.kind === "project" ? "PROJECT DEADLINE" : "MATTER DEADLINE"}
                    </span>
                    {r.marker.matterName && r.marker.kind === "project" && (
                      <span className="meta-scope">{r.marker.matterName.toUpperCase()}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          }
          const t = r.task;
          return (
            <div key={r.key} className="wk-due-row clickable" onClick={() => openExisting(t.id)}>
              <span className={`wk-due-date${t.doDate! <= today ? " is-near" : ""}`}>
                {fmtDate(t.doDate!)}
                <span className="wk-due-in">{t.doTime ? t.dueTag : daysOut(t.doDate!)}</span>
              </span>
              <div className="task-body">
                <div className="task-title">{t.title}</div>
                <Meta t={t} />
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="empty-note">Nothing dated in the next 30 days.</div>
        )}

        <div className="section-label">SITTING WITH · {liveWaiting.length}</div>
        {buckets.map((b) => (
          <div key={b} className="wk-bucket">
            <div className="wk-bucket-label">{b.toUpperCase()}</div>
            {liveWaiting
              .filter((w) => w.waitingOn === b)
              .map((t) => (
                <div key={t.id} className="task-row">
                  <div className="task-body clickable" onClick={() => openExisting(t.id)}>
                    <div className="task-title">{t.title}</div>
                    <Meta t={t} />
                  </div>
                </div>
              ))}
          </div>
        ))}
        {liveWaiting.length === 0 && (
          <div className="empty-note">Nothing marked as sitting with someone else.</div>
        )}

        <div className="section-label overdue">
          GONE SILENT · {data.silent.length} — NO ACTIVITY, NOTHING SCHEDULED
        </div>
        {data.silent.map((m) => (
          <div key={m.id} className="wk-silent-row">
            <div className="task-body">
              <div className="task-title">{m.name}</div>
              <div className="meta">
                {m.client && <span className="meta-scope">{m.client.toUpperCase()}</span>}
                {m.openCount > 0 ? (
                  <span className="kind-task">{m.openCount} OPEN, NONE DATED</span>
                ) : (
                  <span className="case-noaction">NO NEXT ACTION</span>
                )}
              </div>
            </div>
            <span className="wk-silent-age">
              {m.daysSilent === null ? "never touched" : `${m.daysSilent}d silent`}
            </span>
            <button
              type="button"
              className="ov-chip"
              title="Capture a next step — ⌘K prefilled with this case"
              onClick={() => openCapture(`${m.name.split(" - ").pop() ?? m.name} — `)}
            >
              + CAPTURE
            </button>
          </div>
        ))}
        {data.silent.length === 0 && (
          <div className="empty-note">No matter has gone silent. That&rsquo;s the goal.</div>
        )}

        {data.quiet.length > 0 && (
          <>
            <div className="section-label">
              TOUCHED RECENTLY, NOTHING SCHEDULED · {data.quiet.length}
            </div>
            {data.quiet.map((m) => (
              <div key={m.id} className="cc-mini">
                <span className="cc-mini-title">{m.name}</span>
                <span className="cc-mini-date" style={{ color: "var(--muted)" }}>
                  {m.daysSilent === null ? "—" : `${m.daysSilent}d ago`}
                </span>
                <button
                  type="button"
                  className="ov-chip"
                  onClick={() => openCapture(`${m.name.split(" - ").pop() ?? m.name} — `)}
                >
                  +
                </button>
              </div>
            ))}
          </>
        )}

        {data.lifeReady && (
          <>
            <div className="section-label">THE LIFE WEEK</div>
            {data.habitsWeek.length > 0 && (
              <div className="wk-habit-grid">
                <div className="wk-habit-head">
                  <span className="wk-habit-name" />
                  {data.weekDates.map((d) => (
                    <span key={d} className="wk-habit-dow">
                      {DOW1[new Date(`${d}T12:00:00`).getDay()]}
                    </span>
                  ))}
                </div>
                {data.habitsWeek.map((h) => (
                  <div key={h.name} className="wk-habit-head">
                    <span className="wk-habit-name">{h.name}</span>
                    {h.days.map((on, i) => (
                      <span key={i} className={`wk-habit-dot${on ? " is-on" : ""}`} />
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div className="wk-life-line">
              {data.bodyWeek.weightStart !== null && (
                <span>
                  weight {data.bodyWeek.weightStart} → {data.bodyWeek.weightEnd ?? "—"} lbs
                </span>
              )}
              {data.bodyWeek.sleepAvg !== null && <span>sleep avg {data.bodyWeek.sleepAvg}h</span>}
              {data.mediaWeek.length > 0 && (
                <span>
                  watched/played:{" "}
                  {data.mediaWeek.map((m) => m.title).join(", ")}
                </span>
              )}
              {data.bodyWeek.weightStart === null &&
                data.bodyWeek.sleepAvg === null &&
                data.mediaWeek.length === 0 && (
                  <span className="empty-note">No life data logged this week yet.</span>
                )}
            </div>
          </>
        )}
      </section>

      {openTask && (
        <TaskDrawer
          task={openTask}
          matters={matters}
          projects={projects}
          mitCount={tasks.filter((t) => t.mit).length}
          saving={saving}
          saved={saved}
          isNew={false}
          onField={onField}
          onDelete={onDeleteTask}
          onClose={closeDrawer}
          sessions={sessions}
          sessionsLoading={sessionsLoading}
          isRunning={running?.taskId === openTask.id}
          liveElapsed={running?.taskId === openTask.id ? elapsedLabel(running.startedAt) : null}
          onStartStop={() => toggleTimer(openTask.id)}
          onAddEntry={onAddEntry}
          onSessionPatch={onSessionPatch}
          onSessionDelete={onSessionDelete}
          onMarkComplete={onMarkComplete}
          activity={activity}
          activityLoading={activityLoading}
        />
      )}

      {error && <div className="toast">{error}</div>}
    </>
  );
}
