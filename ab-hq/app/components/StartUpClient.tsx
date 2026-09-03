"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  Task,
  Matter,
  Project,
  RunningTimer,
  TimeSession,
  ActivityItem,
} from "@/lib/data";
import { PRIORITY_META, DOMAIN_DOT } from "@/lib/data";
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
import { saveIntention } from "@/app/(app)/daily-actions";
import TaskDrawer from "./TaskDrawer";
import { HabitChecklist, BodyForm } from "./LifeBits";
import type { LifeData } from "@/lib/queries";

const PRI_COLOR: Record<number, string> = { 1: "#e0665a", 2: "#5fbf8f", 3: "#d8a657", 4: "#6f7787" };

function isoShift(today: string, days: number): string {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function nextFriday(today: string): string {
  const d = new Date(`${today}T12:00:00`);
  let add = (5 - d.getDay() + 7) % 7;
  if (add === 0) add = 7;
  return isoShift(today, add);
}
function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000
  );
}
function fmtEffort(min: number | undefined): string | null {
  if (!min) return null;
  if (min < 60) return `${min}m`;
  const h = min / 60;
  return `${h.toFixed(1).replace(/\.0$/, "")}h`;
}

export default function StartUpClient({
  initialTasks,
  matters,
  projects,
  today,
  dateLabel,
  initialIntention,
  onTapFromYesterday,
  initialRunning,
  life,
}: {
  initialTasks: Task[];
  matters: Matter[];
  projects: Project[];
  today: string;
  dateLabel: string;
  initialIntention: string | null;
  onTapFromYesterday: string | null;
  initialRunning: RunningTimer | null;
  life: LifeData;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [intention, setIntention] = useState(initialIntention ?? "");
  const [error, setError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [, startTransition] = useTransition();

  // --- drawer state (same mechanics as My Day) ---
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const openIdRef = useRef(openId);
  openIdRef.current = openId;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  // Optimistic patch, same shape as My Day's savePatch.
  function savePatch(id: string, patch: TaskPatch) {
    setTasks((prev) => prev.map((x) => (x.id === id ? applyPatch(x, patch, today) : x)));
    startTransition(async () => {
      const r = await updateTask(id, patch);
      if (!r.ok) flash(r.error ?? "Couldn't save.");
    });
  }

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
    if (patch.mit === true && openTask && !openTask.mit && mits.length >= 3) {
      flash("You already have 3 protected — clear one first.");
      return;
    }
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

  function onDelete() {
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

  const open = tasks.filter((t) => t.status !== "Someday");
  const mits = tasks.filter((t) => t.mit);
  const mitSlots = [0, 1, 2].map((i) => mits[i] ?? null);

  const dueToday = open.filter((t) => !t.mit && t.doDate === today);
  const overdue = open
    .filter((t) => !t.mit && t.doDate && t.doDate < today)
    .sort((a, b) => (a.doDate! < b.doDate! ? -1 : 1));
  const horizon = isoShift(today, 7);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const obligations = open
    .filter((t) => !t.mit && t.projectId && t.doDate && t.doDate > today && t.doDate <= horizon)
    .sort((a, b) => (a.doDate! < b.doDate! ? -1 : 1));
  // Project terminal deadlines landing this week ride along as their own rows,
  // so the date lives once (on the project) without a duplicate Deadline task.
  type ObItem = { kind: "task"; date: string; t: Task } | { kind: "proj"; date: string; p: Project };
  const obItems: ObItem[] = [
    ...obligations.map((t) => ({ kind: "task" as const, date: t.doDate!, t })),
    ...projects
      .filter(
        (p) => p.status === "Active" && p.deadline && p.deadline >= today && p.deadline <= horizon
      )
      .map((p) => ({ kind: "proj" as const, date: p.deadline!, p })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));

  // Load readout for the lock-in button, from effort estimates on the picks.
  const totalMin = mits.reduce((a, t) => a + (t.durationMin ?? 0), 0);
  const allHighStakes = mits.length === 3 && mits.every((t) => t.priority <= 2);
  const loadHours = fmtEffort(totalMin);
  const loadNote = allHighStakes
    ? "heavy — all high-stakes"
    : totalMin >= 300
      ? "a heavy day"
      : totalMin >= 180
        ? "a full day"
        : null;

  function protect(t: Task) {
    if (mits.length >= 3) {
      flash("You already have 3 protected — clear one first.");
      return;
    }
    savePatch(t.id, { mit: true, doDate: today });
  }

  function lockIn() {
    if (locking) return;
    setLocking(true);
    startTransition(async () => {
      for (const t of mits) {
        if (t.doDate !== today) await updateTask(t.id, { doDate: today });
      }
      const r = await saveIntention(today, intention.trim() || null);
      if (!r.ok) {
        setLocking(false);
        flash(r.error ?? "Couldn't save the intention.");
        return;
      }
      router.push("/my-day");
    });
  }

  function matterName(t: Task): string | undefined {
    return t.matterId ? matters.find((m) => m.id === t.matterId)?.name : undefined;
  }

  function Meta({ t, overdueDays }: { t: Task; overdueDays?: number }) {
    const pm = PRIORITY_META[t.priority];
    const scope = (matterName(t) ?? t.domain).toUpperCase();
    const proj = t.projectId ? projectName.get(t.projectId) : undefined;
    const eff = fmtEffort(t.durationMin);
    return (
      <div className="meta">
        <span className={`pri ${pm.cls}`}>{pm.label}</span>
        <span className="cat-dot" style={{ background: DOMAIN_DOT[t.domain] }} />
        <span className="meta-scope">{scope}</span>
        {proj && <span className="meta-project">{proj.toUpperCase()}</span>}
        {eff && <span className="meta-scope">{eff.toUpperCase()}</span>}
        {overdueDays !== undefined && (
          <span className="overdue-tag">OVERDUE {overdueDays}D</span>
        )}
      </div>
    );
  }

  function Promote({ t }: { t: Task }) {
    return (
      <button
        type="button"
        className="row-promote"
        title="Protect as one of today's 3"
        onClick={() => protect(t)}
      >
        +
      </button>
    );
  }

  const schedule = open
    .filter((t) => t.type === "Event" && t.doTime && t.doDate === today)
    .sort((a, b) => (a.doTime! < b.doTime! ? -1 : 1));

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">START OF DAY · {dateLabel.toUpperCase()}</div>
            <h1 className="display-h1">Good morning.</h1>
          </div>
          <div className="day-head-summary">
            {mits.length}/3 PROTECTED
            <br />
            {overdue.length} OVERDUE
          </div>
        </div>

        {onTapFromYesterday && (
          <div className="ontap">
            <div className="ontap-label">ON TAP FROM YESTERDAY</div>
            <div className="ontap-body">{onTapFromYesterday}</div>
          </div>
        )}

        <div className="section-head" style={{ marginTop: 0 }}>
          <div className="section-label">
            TODAY&rsquo;S COMMITMENT · {mits.length}/3
          </div>
          {loadNote && <div className="su-load-note">{loadNote}</div>}
        </div>
        <div className="su-commit">
          {mitSlots.map((t, i) =>
            t ? (
              <div key={t.id} className="su-card" style={{ borderLeftColor: PRI_COLOR[t.priority] }}>
                <div className="su-card-top">
                  <div className="mit-num">{i + 1}</div>
                  <div className="su-card-side">
                    {fmtEffort(t.durationMin) && (
                      <span className="su-eff">{fmtEffort(t.durationMin)}</span>
                    )}
                    <button
                      type="button"
                      className="su-x"
                      title="Release this slot"
                      onClick={() => savePatch(t.id, { mit: false })}
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="su-card-title clickable" onClick={() => openExisting(t.id)}>
                  {t.title}
                </div>
                <Meta t={t} />
              </div>
            ) : (
              <div key={`empty-${i}`} className="su-card su-empty">
                <div className="mit-empty-num">{i + 1}</div>
                <div className="mit-empty-text">Pick from below</div>
              </div>
            )
          )}
        </div>

        <input
          className="intent-input"
          placeholder="Intention for today…  (one line, optional)"
          value={intention}
          onChange={(e) => setIntention(e.target.value)}
        />

        <button
          type="button"
          className="btn-lock"
          disabled={mits.length === 0 || locking}
          onClick={lockIn}
        >
          {locking ? "Locking in…" : "Lock in the day →"}
          {(loadHours || loadNote) && !locking && (
            <span className="lock-load">
              {[loadHours, loadNote].filter(Boolean).join(" · ")}
            </span>
          )}
        </button>

        <div className="section-label">DUE TODAY · {dueToday.length}</div>
        {dueToday.map((t) => (
          <div key={t.id} className="task-row">
            <Promote t={t} />
            <div className="task-body clickable" onClick={() => openExisting(t.id)}>
              <div className="task-title">{t.title}</div>
              <Meta t={t} />
            </div>
          </div>
        ))}
        {dueToday.length === 0 && (
          <div className="empty-note">Nothing else scheduled for today.</div>
        )}

        <div className="section-label">
          PROJECT OBLIGATIONS THIS WEEK · {obItems.length}
        </div>
        <div className="ob-list">
          {obItems.map((item) => {
            const diff = daysBetween(today, item.date);
            const border = diff <= 1 ? "var(--orange)" : diff <= 3 ? "var(--amber)" : "var(--line-raised-2)";
            const dueCls = diff <= 1 ? "ob-due hot" : diff <= 3 ? "ob-due warm" : "ob-due";
            const dueLabel = diff === 0 ? "today" : diff === 1 ? "tomorrow" : `in ${diff}d`;
            if (item.kind === "proj") {
              const p = item.p;
              const mn = p.matterId
                ? matters.find((m) => m.id === p.matterId)?.name
                : undefined;
              return (
                <div key={`proj-${p.id}`} className="ob-row" style={{ borderLeftColor: border }}>
                  <span className="ob-flag" title="Project deadline">◆</span>
                  <div className="task-body">
                    <div className="task-title">{p.name}</div>
                    <div className="meta">
                      <span className="kind-deadline">PROJECT DEADLINE</span>
                      {mn && <span className="meta-scope">{mn.toUpperCase()}</span>}
                    </div>
                  </div>
                  <span className={dueCls}>{dueLabel}</span>
                </div>
              );
            }
            const t = item.t;
            return (
              <div key={t.id} className="ob-row" style={{ borderLeftColor: border }}>
                <Promote t={t} />
                <div className="task-body clickable" onClick={() => openExisting(t.id)}>
                  <div className="task-title">{t.title}</div>
                  <div className="meta">
                    <span className="meta-scope">
                      {(projectName.get(t.projectId!) ?? "PROJECT").toUpperCase()}
                      {matterName(t) ? ` — ${matterName(t)!.toUpperCase()}` : ""}
                    </span>
                    {fmtEffort(t.durationMin) && (
                      <span className="meta-scope">{fmtEffort(t.durationMin)!.toUpperCase()}</span>
                    )}
                  </div>
                </div>
                <span className={dueCls}>{dueLabel}</span>
              </div>
            );
          })}
        </div>
        {obItems.length === 0 && (
          <div className="empty-note">
            Nothing project-tagged lands this week. Tag tasks with a project to see them here.
          </div>
        )}

        <div className="section-label overdue">
          OVERDUE · NEEDS A HOME · {overdue.length}
        </div>
        {overdue.map((t) => (
          <div key={t.id} className="task-row">
            <Promote t={t} />
            <div className="task-body clickable" onClick={() => openExisting(t.id)}>
              <div className="task-title">{t.title}</div>
              <Meta t={t} overdueDays={daysBetween(t.doDate!, today)} />
            </div>
            <div className="ov-chips">
              <button
                type="button"
                className="ov-chip"
                onClick={() => savePatch(t.id, { doDate: isoShift(today, 1) })}
              >
                TMRW
              </button>
              <button
                type="button"
                className="ov-chip"
                onClick={() => savePatch(t.id, { doDate: nextFriday(today) })}
              >
                FRI
              </button>
              <input
                type="date"
                className="ov-date"
                title="Pick a date"
                value=""
                onChange={(e) => {
                  if (e.target.value) savePatch(t.id, { doDate: e.target.value });
                }}
              />
              <button
                type="button"
                className="ov-chip"
                onClick={() => savePatch(t.id, { status: "Someday", doDate: null })}
              >
                SOMEDAY
              </button>
            </div>
          </div>
        ))}
        {overdue.length === 0 && <div className="empty-note">Nothing overdue. Clean slate.</div>}
      </section>

      <aside className="rail">
        <div className="rail-block">
          <div className="rail-label">TODAY&rsquo;S SCHEDULE</div>
          {schedule.map((t) => (
            <div key={t.id} className="su-sched-row">
              <span className="su-sched-time">{t.dueTag}</span>
              <div className="su-sched-body">
                <div className="su-sched-title">{t.title}</div>
                {matterName(t) && <div className="su-sched-sub">{matterName(t)}</div>}
              </div>
            </div>
          ))}
          {schedule.length === 0 && <div className="empty-note">No timed events yet.</div>}
        </div>

        {life.lifeReady && (
          <>
            <div className="rail-block">
              <div className="rail-label">MORNING ROUTINE</div>
              <HabitChecklist habits={life.habits} today={today} onError={flash} />
            </div>
            <div className="rail-block">
              <div className="rail-label">BODY — THIS MORNING</div>
              <BodyForm body={life.body} today={today} mode="morning" onError={flash} />
            </div>
          </>
        )}

        <div className="rail-block">
          <div className="rail-label">AT A GLANCE</div>
          <div className="glance-row">
            <span>Due today</span>
            <span>{dueToday.length}</span>
          </div>
          <div className="glance-row">
            <span>Project obligations this week</span>
            <span>{obItems.length}</span>
          </div>
          <div className="glance-row">
            <span className={overdue.length ? "glance-hot" : undefined}>Overdue</span>
            <span className={overdue.length ? "glance-hot" : undefined}>{overdue.length}</span>
          </div>
        </div>
      </aside>

      {openTask && (
        <TaskDrawer
          task={openTask}
          matters={matters}
          projects={projects}
          mitCount={mits.length}
          saving={saving}
          saved={saved}
          isNew={false}
          onField={onField}
          onDelete={onDelete}
          onClose={closeDrawer}
          sessions={sessions}
          sessionsLoading={sessionsLoading}
          isRunning={running?.taskId === openTask.id}
          liveElapsed={
            running?.taskId === openTask.id ? elapsedLabel(running.startedAt) : null
          }
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
