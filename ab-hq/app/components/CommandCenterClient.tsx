"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Task, RunningTimer, TimeSession, ActivityItem } from "@/lib/data";
import { PRIORITY_META, DOMAIN_DOT } from "@/lib/data";
import type { CommandCenterData } from "@/lib/queries";
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

const MO = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MO[m - 1]} ${d}`;
}

export default function CommandCenterClient({
  data,
  dateLabel,
}: {
  data: CommandCenterData;
  dateLabel: string;
}) {
  const router = useRouter();
  const { matters, projects, today } = data;
  const [tasks, setTasks] = useState<Task[]>(data.upNextTasks);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  // --- drawer wiring (same mechanics as the ritual surfaces) ---
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

  // Merge live tasks with project/matter deadline markers, chronological.
  type Row =
    | { key: string; date: string; sort: string; task: Task }
    | { key: string; date: string; sort: string; marker: CommandCenterData["upNextMarkers"][0] };
  const rows: Row[] = [
    ...tasks
      .filter((t) => t.status !== "Done")
      .map((t) => ({
        key: t.id,
        date: t.doDate!,
        sort: `${t.doDate}T${t.doTime ?? "99:99"}P${t.priority}`,
        task: t,
      })),
    ...data.upNextMarkers.map((m, i) => ({
      key: `mk-${i}`,
      date: m.date,
      sort: `${m.date}T98:99P0`,
      marker: m,
    })),
  ].sort((a, b) => (a.sort < b.sort ? -1 : 1));

  const greeting =
    data.hour < 12 ? "Good morning." : data.hour < 17 ? "Good afternoon." : "Good evening.";

  const attention: { label: string; n: number; hot: boolean; href: string }[] = [
    { label: "DUE TODAY", n: data.dueToday, hot: false, href: "/plan/today?mode=today" },
    { label: "OVERDUE", n: data.overdue, hot: data.overdue > 0, href: "/plan/today?mode=start" },
    { label: "NEEDS A HOME", n: data.needsHome, hot: false, href: "/work/inbox" },
    { label: "GONE SILENT", n: data.silent, hot: data.silent > 0, href: "/plan/week" },
  ];

  const flow: { title: string; status: string; done: boolean; href: string }[] = [
    {
      title: "Start Up",
      status: data.intentionSet ? "intention set ✓" : "not started",
      done: data.intentionSet,
      href: "/plan/today?mode=start",
    },
    {
      title: "Today",
      status: `${data.mitDone}/${data.mitCount || 3} MITs done`,
      done: data.mitCount > 0 && data.mitDone === data.mitCount,
      href: "/plan/today?mode=today",
    },
    {
      title: "Wind Down",
      status: data.dayClosed
        ? "day closed ✓"
        : data.habitsTotal > 0
          ? `habits ${data.habitsDone}/${data.habitsTotal}`
          : "not closed",
      done: data.dayClosed,
      href: "/plan/today?mode=wind",
    },
  ];

  const hubs: { title: string; line: string; sub?: string; href: string; hot?: boolean }[] = [
    {
      title: "Tasks",
      line: `${data.openTasks} open${data.overdue ? ` · ${data.overdue} overdue` : ""}`,
      sub: tasks[0] ? `next: ${tasks[0].title}` : undefined,
      href: "/work/tasks",
      hot: data.overdue > 0,
    },
    {
      title: "Cases",
      line: `${data.activeMatters} active${data.silent ? ` · ${data.silent} silent` : ""}`,
      sub: data.silentTop[0]
        ? `quietest: ${data.silentTop[0].name} (${data.silentTop[0].daysSilent ?? "—"}d)`
        : undefined,
      href: "/work/cases",
      hot: data.silent > 0,
    },
    {
      title: "Projects",
      line: `${data.activeProjects} active`,
      sub: data.nextProjectName
        ? `${data.nextProjectName} due ${fmtDate(data.nextProjectDeadline!)}`
        : undefined,
      href: "/work/projects",
    },
    {
      title: "Quick Drop",
      line: `${data.needsHome} need a home · ${data.ledgerCount} in the ledger`,
      sub: data.unfiledLatest ? `“${data.unfiledLatest.slice(0, 60)}”` : undefined,
      href: "/work/inbox",
    },
    {
      title: "Weekly review",
      line: `${data.due30} due in 30d · ${data.waiting} sitting with others`,
      href: "/plan/week",
    },
    {
      title: "Day ledger",
      line: `${(data.tenthsToday / 10).toFixed(1)}h entered today`,
      sub: data.touchedToday
        ? `${data.touchedToday} matter${data.touchedToday === 1 ? "" : "s"} touched`
        : undefined,
      href: "/work/time",
    },
    { title: "Notes", line: `${data.noteCount} notes`, href: "/notes" },
    { title: "People", line: `${data.peopleCount} people`, href: "/notes/people" },
  ];

  function daysOut(iso: string): string {
    const d = Math.round(
      (new Date(`${iso}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000
    );
    return d === 0 ? "today" : d === 1 ? "tmrw" : `${d}d`;
  }

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">ANDY&rsquo;S HQ · {dateLabel.toUpperCase()}</div>
            <h1 className="display-h1">{greeting}</h1>
          </div>
        </div>

        <div className="wk-glance cc-attention">
          {attention.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`wk-stat cc-stat${a.hot ? " is-hot" : ""}`}
              onClick={() => router.push(a.href)}
            >
              <div className="wk-stat-num">{a.n}</div>
              <div className="wk-stat-label">{a.label}</div>
            </button>
          ))}
        </div>

        <div className="section-label">THE DAY</div>
        <div className="cc-flow">
          {flow.map((f) => (
            <button
              key={f.title}
              type="button"
              className={`cc-flow-card${f.done ? " is-done" : ""}`}
              onClick={() => router.push(f.href)}
            >
              <span className="cc-flow-title">{f.title}</span>
              <span className="cc-flow-status">{f.status}</span>
            </button>
          ))}
        </div>

        <div className="section-label">UP NEXT</div>
        {rows.slice(0, 9).map((r) => {
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
                  {fmtDate(r.date)}
                  <span className="wk-due-in">{daysOut(r.date)}</span>
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
          const pm = PRIORITY_META[t.priority];
          const kindCls =
            t.type === "Event" ? "kind-event" : t.type === "Deadline" ? "kind-deadline" : "kind-task";
          return (
            <div key={r.key} className="wk-due-row clickable" onClick={() => openExisting(t.id)}>
              <span className={`wk-due-date${r.date <= today ? " is-near" : ""}`}>
                {fmtDate(r.date)}
                <span className="wk-due-in">
                  {t.doTime ? t.dueTag : daysOut(r.date)}
                </span>
              </span>
              <div className="task-body">
                <div className="task-title">{t.title}</div>
                <div className="meta">
                  <span className={`pri ${pm.cls}`}>{pm.label}</span>
                  <span className="cat-dot" style={{ background: DOMAIN_DOT[t.domain] }} />
                  <span className="meta-scope">
                    {(matterName(t.matterId) ?? t.domain).toUpperCase()}
                  </span>
                  {projectName(t.projectId) && (
                    <span className="meta-project">{projectName(t.projectId)!.toUpperCase()}</span>
                  )}
                  <span className={kindCls}>{t.type.toUpperCase()}</span>
                  {t.recur && <span className="kind-event" title="Repeats">↻</span>}
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div className="empty-note">Nothing dated in the next 30 days.</div>}

        {(data.overdueTop.length > 0 || data.silentTop.length > 0) && (
          <div className="cc-cols">
            {data.overdueTop.length > 0 && (
              <div>
                <div className="section-label overdue">OVERDUE · {data.overdue}</div>
                {data.overdueTop.map((t) => (
                  <div
                    key={t.id}
                    className="cc-mini clickable"
                    onClick={() => router.push("/plan/today?mode=start")}
                  >
                    <span className="cc-mini-title">{t.title}</span>
                    {t.matterName && (
                      <span className="cc-mini-scope">{t.matterName.toUpperCase()}</span>
                    )}
                    <span className="cc-mini-date">{fmtDate(t.doDate)}</span>
                  </div>
                ))}
              </div>
            )}
            {data.silentTop.length > 0 && (
              <div>
                <div className="section-label overdue">GONE SILENT · {data.silent}</div>
                {data.silentTop.slice(0, 4).map((m) => (
                  <div
                    key={m.name}
                    className="cc-mini clickable"
                    onClick={() => router.push("/plan/week")}
                  >
                    <span className="cc-mini-title">{m.name}</span>
                    <span className="cc-mini-date">
                      {m.daysSilent === null ? "never" : `${m.daysSilent}d`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="section-label">HUBS</div>
        <div className="case-grid cc-hubs">
          {hubs.map((h) => (
            <button
              key={h.title}
              type="button"
              className="case-card clickable cc-hub-card"
              onClick={() => router.push(h.href)}
            >
              <div className="case-name">{h.title}</div>
              <div className={`cc-hub-line${h.hot ? " is-hot" : ""}`}>{h.line}</div>
              {h.sub && <div className="cc-hub-sub">{h.sub}</div>}
            </button>
          ))}
        </div>
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
