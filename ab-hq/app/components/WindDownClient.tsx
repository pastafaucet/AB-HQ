"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  Task,
  Entry,
  EntryKind,
  Matter,
  Project,
  RunningTimer,
  TimeSession,
  ActivityItem,
} from "@/lib/data";
import type { MatterOption, LifeData } from "@/lib/queries";
import { HabitChecklist, BodyForm } from "./LifeBits";
import { saveJournal, logMedia, deleteMedia, type MediaItem } from "@/app/(app)/life-actions";
import { PRIORITY_META, DOMAIN_DOT, PRI_COLOR } from "@/lib/data";
import { isPastDue } from "@/lib/task-dates";
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
import { updateEntry, entryToTask, deleteEntry, type EntryPatch } from "@/app/(app)/entry-actions";
import { saveWindDown } from "@/app/(app)/daily-actions";
import ConfirmButton from "./ConfirmButton";
import { applyChange, useDrawerChanges } from "./drawers/bus";
import Link from "next/link";

const KINDS: EntryKind[] = ["log", "task", "note", "event"];

export default function WindDownClient({
  today,
  tomorrow,
  dateLabel,
  doneToday,
  mits: initialMits,
  candidates: initialCandidates,
  inboxEntries: initialInbox,
  capturedToday,
  matters,
  matterOptions,
  projects,
  onTapForTomorrow,
  reflection: initialReflection,
  entriesReady,
  life,
  initialRunning,
  mediaTitles,
}: {
  today: string;
  tomorrow: string;
  dateLabel: string;
  doneToday: Task[];
  mits: Task[];
  candidates: Task[];
  inboxEntries: Entry[];
  capturedToday: number;
  matters: Matter[];
  matterOptions: MatterOption[];
  projects: Project[];
  onTapForTomorrow: string | null;
  reflection: string | null;
  entriesReady: boolean;
  life: LifeData;
  initialRunning: RunningTimer | null;
  mediaTitles: { kind: string; title: string }[];
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([
    ...doneToday,
    ...initialMits,
    ...initialCandidates,
  ]);
  // A task edited in a drawer opened over this screen (⌘J, a link) updates here.
  useDrawerChanges<Task>("task", (d) => setTasks((prev) => applyChange(prev, d)));
  const [entries, setEntries] = useState<Entry[]>(initialInbox);
  const [onTap, setOnTap] = useState(onTapForTomorrow ?? "");
  const [reflection, setReflection] = useState(initialReflection ?? "");
  const [journal, setJournal] = useState(life.journal ?? "");
  const [media, setMedia] = useState(life.mediaToday);
  const [mediaKind, setMediaKind] = useState<MediaItem["kind"]>("show");
  const [mediaTitle, setMediaTitle] = useState("");
  const [mediaNote, setMediaNote] = useState("");
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  function savePatch(id: string, patch: TaskPatch) {
    setTasks((prev) => prev.map((x) => (x.id === id ? applyPatch(x, patch, today) : x)));
    startTransition(async () => {
      const r = await updateTask(id, patch);
      if (!r.ok) flash(r.error ?? "Couldn't save.");
    });
  }

  // --- drawer state (same mechanics as Start Up / My Day) ---
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
      flash("3 protected already — clear one first.");
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

  const doneList = tasks.filter((t) => t.status === "Done");
  const openTasks = tasks.filter((t) => t.status !== "Done");
  const mits = openTasks.filter((t) => t.mit);
  const unresolved = mits.filter((t) => !t.doDate || t.doDate <= today);
  const rolled = mits.filter((t) => t.doDate === tomorrow);
  // Only tomorrow-or-sooner (or undated high-priority) — never dated-future work.
  const candidates = openTasks.filter(
    (t) => !t.mit && (t.doDate ? t.doDate <= tomorrow : t.priority <= 2)
  );

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

  function roll(t: Task) {
    savePatch(t.id, { doDate: tomorrow });
  }
  function drop(t: Task) {
    savePatch(t.id, { mit: false });
  }
  function protect(t: Task) {
    if (mits.length >= 3) {
      flash("3 protected already — roll fewer or drop one first.");
      return;
    }
    savePatch(t.id, { mit: true, doDate: tomorrow });
  }

  // --- Quick Drop triage (inline) ---
  function patchEntry(id: string, p: EntryPatch) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              ...(p.kind !== undefined ? { kind: p.kind } : {}),
              ...(p.status !== undefined ? { status: p.status } : {}),
              ...(p.matterId !== undefined ? { matterId: p.matterId ?? undefined } : {}),
              routedBy: "manual" as const,
            }
          : e
      ).filter((e) => e.status === "inbox")
    );
    startTransition(async () => {
      const r = await updateEntry(id, p);
      if (!r.ok) flash(r.error ?? "Couldn't save.");
    });
  }
  function onMakeTask(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    startTransition(async () => {
      const r = await entryToTask(id);
      if (r.ok) flash(`Task created: “${r.taskTitle}”`);
      else flash(r.error ?? "Couldn't create task.");
    });
  }
  function onDeleteEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    startTransition(async () => {
      const r = await deleteEntry(id);
      if (!r.ok) flash(r.error ?? "Couldn't delete.");
    });
  }

  function submitMedia() {
    const title = mediaTitle.trim();
    if (!title) return;
    const note = mediaNote.trim() || null;
    const kind = mediaKind;
    setMediaTitle("");
    setMediaNote("");
    startTransition(async () => {
      const r = await logMedia(today, kind, title, note);
      if (r.ok && r.item) setMedia((prev) => [...prev, { ...r.item!, note: r.item!.note }]);
      else flash(r.error ?? "Couldn't log.");
    });
  }

  function removeMedia(id: string) {
    setMedia((prev) => prev.filter((m) => m.id !== id));
    startTransition(async () => {
      const r = await deleteMedia(id);
      if (!r.ok) flash(r.error ?? "Couldn't delete.");
    });
  }

  function persistJournal(text: string) {
    startTransition(async () => {
      const r = await saveJournal(today, text.trim() || null);
      if (!r.ok) flash(r.error ?? "Couldn't save journal.");
    });
  }

  function closeDay() {
    if (closing) return;
    setClosing(true);
    startTransition(async () => {
      const r = await saveWindDown(today, {
        onTapForTomorrow: onTap.trim() || null,
        reflection: reflection.trim() || null,
      });
      setClosing(false);
      if (r.ok) {
        setClosed(true);
        setTimeout(() => router.push("/"), 900);
      } else flash(r.error ?? "Couldn't save.");
    });
  }

  const matterName = (id?: string) => (id ? matters.find((m) => m.id === id)?.name : undefined);
  const projectName = (id?: string) => (id ? projects.find((p) => p.id === id)?.name : undefined);

  function dateChip(iso: string): string {
    if (iso === today) return "TODAY";
    if (iso === tomorrow) return "TMRW";
    const MO = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const [, m, d] = iso.split("-").map(Number);
    return `${MO[m - 1]} ${d}`;
  }

  function Meta({ t }: { t: Task }) {
    const pm = PRIORITY_META[t.priority];
    const scope = (matterName(t.matterId) ?? t.domain).toUpperCase();
    const kindCls =
      t.type === "Event" ? "kind-event" : t.type === "Deadline" ? "kind-deadline" : "kind-task";
    return (
      <div className="meta">
        <span className={`pri ${pm.cls}`}>{pm.label}</span>
        <span className="cat-dot" style={{ background: DOMAIN_DOT[t.domain] }} />
        <span className="meta-scope">{scope}</span>
        {projectName(t.projectId) && (
          <span className="meta-project">{projectName(t.projectId)!.toUpperCase()}</span>
        )}
        <span className={kindCls}>{t.type.toUpperCase()}</span>
        {t.doDate && (
          <span className={isPastDue(t, today) ? "overdue-tag" : "time-tag"}>
            {dateChip(t.doDate)}
            {isPastDue(t, today) ? " · OVERDUE" : ""}
          </span>
        )}
        {t.doTime && <span className="time-tag">{t.dueTag}</span>}
        {t.recur && <span className="kind-event" title="Repeats">↻</span>}
      </div>
    );
  }

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">WIND DOWN · {dateLabel.toUpperCase()}</div>
            <h1 className="display-h1">Close the day.</h1>
          </div>
          <div className="day-head-summary">
            {doneList.length} DONE · {capturedToday} CAPTURED
          </div>
        </div>

        <div className="section-label tight">DONE TODAY · {doneList.length}</div>
        {doneList.map((t) => (
          <div key={t.id} className="task-row">
            <button
              type="button"
              className="check is-done wd-done-check"
              title="Reopen"
              onClick={() => toggleDone(t)}
            >
              ✓
            </button>
            <div className="task-body clickable" onClick={() => openExisting(t.id)}>
              <div className="task-title is-done">{t.title}</div>
              <Meta t={t} />
            </div>
          </div>
        ))}
        {doneList.length === 0 && (
          <div className="empty-note">Nothing checked off today — it happens.</div>
        )}

        <div className="section-label">
          UNFINISHED MITS · {unresolved.length} — ROLL OR DROP, HONESTLY
        </div>
        {unresolved.map((t) => (
          <div key={t.id} className="mit-row" style={{ borderLeftColor: PRI_COLOR[t.priority] }}>
            <button
              type="button"
              className="check mit-check-left"
              title="Actually finished it — mark done"
              onClick={() => toggleDone(t)}
            />
            <div className="mit-body clickable" onClick={() => openExisting(t.id)}>
              <div className="mit-title">{t.title}</div>
              <Meta t={t} />
            </div>
            <div className="ov-chips">
              <button type="button" className="ov-chip" onClick={() => roll(t)}>
                ROLL → TMRW
              </button>
              <button
                type="button"
                className="ov-chip"
                title="Unprotect — stays in your lists, loses the slot"
                onClick={() => drop(t)}
              >
                DROP
              </button>
            </div>
          </div>
        ))}
        {unresolved.length === 0 && (
          <div className="empty-note">
            {rolled.length > 0
              ? `All set — ${rolled.length} rolled to tomorrow.`
              : "No unfinished MITs. Clean close."}
          </div>
        )}

        {entriesReady && (
          <>
            <div className="section-label">NEEDS A HOME · {entries.length}</div>
            {entries.map((e) => (
              <div key={e.id} className="entry-row">
                <div className="entry-main">
                  <div className="entry-raw">{e.raw}</div>
                  <div className="meta entry-meta">
                    <span className="entry-kind">{e.kind.toUpperCase()}</span>
                  </div>
                </div>
                <div className="entry-controls">
                  <select
                    className="entry-select"
                    value={e.matterId ?? ""}
                    onChange={(ev) =>
                      patchEntry(e.id, {
                        matterId: ev.target.value || null,
                        status: ev.target.value ? "filed" : e.status,
                      })
                    }
                  >
                    <option value="">— case —</option>
                    {matterOptions
                      .filter((m) => !m.closed)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                  <select
                    className="entry-select"
                    value={e.kind}
                    onChange={(ev) => patchEntry(e.id, { kind: ev.target.value as EntryKind })}
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  {!e.taskId && (
                    <button type="button" className="ov-chip" onClick={() => onMakeTask(e.id)}>
                      →TASK
                    </button>
                  )}
                  <button
                    type="button"
                    className="ov-chip"
                    onClick={() => patchEntry(e.id, { status: "filed" })}
                  >
                    KEEP
                  </button>
                  <ConfirmButton
                    className="ov-chip"
                    label="✕"
                    confirmLabel="SURE?"
                    title="Delete permanently — aggressive delete is a feature"
                    onConfirm={() => onDeleteEntry(e.id)}
                  />
                </div>
              </div>
            ))}
            {entries.length === 0 && (
              <div className="empty-note">Inbox zero. Everything captured has a home.</div>
            )}
          </>
        )}

        <div className="section-label">
          TOMORROW&rsquo;S 3 · {mits.length}/3 PROTECTED
        </div>
        {mits.map((t) => (
          <div key={t.id} className="mit-row" style={{ borderLeftColor: PRI_COLOR[t.priority] }}>
            <button
              type="button"
              className="check mit-check-left"
              title="Mark done"
              onClick={() => toggleDone(t)}
            />
            <div className="mit-num">{mits.indexOf(t) + 1}</div>
            <div className="mit-body clickable" onClick={() => openExisting(t.id)}>
              <div className="mit-title">{t.title}</div>
              <Meta t={t} />
            </div>
            <button
              type="button"
              className="su-x"
              title="Release this slot"
              onClick={() => drop(t)}
            >
              ×
            </button>
          </div>
        ))}
        {candidates.length > 0 && mits.length < 3 && (
          <>
            <div className="wd-pick-label">PICK FROM:</div>
            {candidates.slice(0, 12).map((t) => (
              <div key={t.id} className="task-row">
                <button
                  type="button"
                  className="check task-check"
                  title="Mark done"
                  onClick={() => toggleDone(t)}
                />
                <button
                  type="button"
                  className="row-promote"
                  title="Protect for tomorrow"
                  onClick={() => protect(t)}
                >
                  +
                </button>
                <div className="task-body clickable" onClick={() => openExisting(t.id)}>
                  <div className="task-title">{t.title}</div>
                  <Meta t={t} />
                </div>
              </div>
            ))}
          </>
        )}

        <div className="section-label">ON TAP FOR TOMORROW</div>
        <textarea
          className="intent-input wd-ontap"
          placeholder="What tomorrow-you should know walking in — Start Up shows this first thing…"
          rows={2}
          value={onTap}
          onChange={(e) => setOnTap(e.target.value)}
        />
        <input
          className="intent-input"
          placeholder="One line on today…  (optional)"
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
        />

        {life.lifeReady ? (
          <>
            <div className="section-label">JOURNAL — TOP THINGS OF THE DAY</div>
            {life.journalLastYear && (
              <div className="ontap wd-yearago">
                <div className="ontap-label">A YEAR AGO TODAY</div>
                <div className="ontap-body">{life.journalLastYear}</div>
              </div>
            )}
            <textarea
              className="intent-input wd-journal"
              placeholder="Open space. What mattered, what happened, what you want to remember…"
              rows={4}
              value={journal}
              onChange={(e) => setJournal(e.target.value)}
              onBlur={(e) => persistJournal(e.target.value)}
            />

            <div className="section-label">TONIGHT · {media.length}</div>
            <div className="media-add">
              <select
                className="entry-select"
                value={mediaKind}
                onChange={(e) => setMediaKind(e.target.value as MediaItem["kind"])}
              >
                <option value="show">show</option>
                <option value="movie">movie</option>
                <option value="game">game</option>
                <option value="book">book</option>
              </select>
              <input
                className="intent-input media-title"
                placeholder="What you watched / played / read…"
                value={mediaTitle}
                list="media-title-suggestions"
                onChange={(e) => setMediaTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitMedia();
                }}
              />
              <datalist id="media-title-suggestions">
                {mediaTitles
                  .filter((t) => t.kind === mediaKind)
                  .slice(0, 50)
                  .map((t) => (
                    <option key={`${t.kind}:${t.title}`} value={t.title} />
                  ))}
              </datalist>
              <input
                className="intent-input media-note"
                placeholder="with / note…"
                value={mediaNote}
                onChange={(e) => setMediaNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitMedia();
                }}
              />
              <button type="button" className="ov-chip" onClick={submitMedia}>
                LOG
              </button>
            </div>
            {media.map((m) => (
              <div key={m.id} className="media-row">
                <span className="media-kind">{m.kind.toUpperCase()}</span>
                <span className="media-title-text">{m.title}</span>
                {m.note && <span className="media-note-text">{m.note}</span>}
                <button
                  type="button"
                  className="su-x"
                  title="Remove"
                  onClick={() => removeMedia(m.id)}
                >
                  ×
                </button>
              </div>
            ))}

            <div className="section-label">HABITS</div>
            <HabitChecklist habits={life.habits} today={today} onError={flash} />

            <div className="section-label">BODY</div>
            <BodyForm body={life.body} today={today} mode="evening" onError={flash} />
          </>
        ) : (
          <div className="ontap">
            <div className="ontap-label" style={{ color: "var(--orange)" }}>
              ONE-TIME SETUP NEEDED
            </div>
            <div className="ontap-body">
              Journal, habits, media log, and body metrics activate once you run{" "}
              <code>supabase/migrations/0015_life.sql</code> in Supabase.
            </div>
          </div>
        )}

        <div className="section-label">HOURS</div>
        <div className="wd-hours">
          Time is logged from Capture (<code>AB 218 - review memo (.4)</code>) straight to the hours sheet.{" "}
          <Link href="/work/time" className="tc-link">
            See today&rsquo;s hours →
          </Link>
        </div>

        <button className="btn-lock wd-close" type="button" disabled={closing} onClick={closeDay}>
          {closed ? "Day closed ✓" : closing ? "Closing…" : "Close the day →"}
          {!closed && !closing && (
            <span className="lock-load">
              {mits.length}/3 set for tomorrow{entries.length > 0 ? ` · ${entries.length} unfiled` : ""}
            </span>
          )}
        </button>
      </section>

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
