"use client";

import { useRef, useState, useTransition } from "react";
import type { Task, Matter, Domain, TaskStatus, TaskType } from "@/lib/data";
import { derivePriority, DOMAIN_DOT } from "@/lib/data";
import { dueTagFor } from "@/lib/task-map";
import {
  setTaskDone,
  updateTask,
  createTask,
  deleteTask,
  type TaskPatch,
} from "@/app/(app)/task-actions";
import TaskDrawer from "./TaskDrawer";

const DRAFT = "draft";

function applyPatch(t: Task, p: TaskPatch, today: string): Task {
  const next: Task = { ...t };
  if (p.title !== undefined) next.title = p.title;
  if (p.important !== undefined) next.important = p.important;
  if (p.urgent !== undefined) next.urgent = p.urgent;
  if (p.mit !== undefined) next.mit = p.mit;
  if (p.status !== undefined) next.status = p.status as TaskStatus;
  if (p.domain !== undefined) next.domain = p.domain as Domain;
  if (p.type !== undefined) next.type = p.type as TaskType;
  if (p.matterId !== undefined) next.matterId = p.matterId ?? undefined;
  if (p.doDate !== undefined) next.doDate = p.doDate ?? undefined;
  if (p.deadline !== undefined) {
    next.deadline = p.deadline ?? undefined;
    next.dueTag = dueTagFor(p.deadline ?? null, today);
  }
  return next;
}

function fullPatch(t: Task): TaskPatch {
  return {
    title: t.title,
    important: t.important,
    urgent: t.urgent,
    mit: t.mit,
    status: t.status,
    domain: t.domain,
    type: t.type,
    matterId: t.matterId ?? null,
    doDate: t.doDate ?? null,
    deadline: t.deadline ?? null,
  };
}

export default function TaskListClient({
  initialTasks,
  matters,
  today,
}: {
  initialTasks: Task[];
  matters: Matter[];
  today: string;
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creating = useRef(false);

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

  function openExisting(t: Task) {
    setOpenId(t.id);
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
      important: false,
      urgent: false,
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
    const pri = derivePriority(t.important, t.urgent);
    const scope = t.matterId
      ? matters.find((m) => m.id === t.matterId)?.name.toUpperCase() ?? t.domain.toUpperCase()
      : t.domain.toUpperCase();
    const kindCls =
      t.type === "Event" ? "kind-event" : t.type === "Deadline" ? "kind-deadline" : "kind-task";
    return (
      <div className="meta">
        <span className={`pri ${pri.cls}`}>{pri.label}</span>
        <span className="cat-dot" style={{ background: DOMAIN_DOT[t.domain] }} />
        <span className="meta-scope">{scope}</span>
        <span className={kindCls}>{t.type.toUpperCase()}</span>
        {t.dueTag && <span className="due-tag">{t.dueTag}</span>}
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

  function Row({ t }: { t: Task }) {
    const done = t.status === "Done";
    return (
      <div className="task-row">
        <Check t={t} className="task-check" />
        <div className="task-body clickable" onClick={() => openExisting(t)}>
          <div className={`task-title${done ? " is-done" : ""}`}>{t.title}</div>
          <Meta t={t} />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Quick capture */}
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

      {/* Protected Top 3 MITs */}
      <div className="section-label tight">
        TODAY&rsquo;S 3 · {mitsDone}/{mits.length} DONE
      </div>
      <div className="mit-list">
        {mitSlots.map((t, i) =>
          t ? (
            <div key={t.id} className={`mit-row${t.status === "Done" ? " is-done" : ""}`}>
              <div className="mit-num">{t.status === "Done" ? "✓" : i + 1}</div>
              <div className="mit-body clickable" onClick={() => openExisting(t)}>
                <div className={`mit-title${t.status === "Done" ? " is-done" : ""}`}>
                  {t.title}
                </div>
                <Meta t={t} />
              </div>
              <Check t={t} className="mit-check" />
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

      {/* Also today */}
      <div className="section-label">ALSO TODAY · {alsoToday.length}</div>
      {alsoToday.map((t) => (
        <Row key={t.id} t={t} />
      ))}
      {alsoToday.length === 0 && <div className="empty-note">Nothing else queued for today.</div>}

      {/* In progress */}
      <div className="section-label">IN PROGRESS · {inProgress.length}</div>
      {inProgress.map((t) => (
        <Row key={t.id} t={t} />
      ))}
      {inProgress.length === 0 && <div className="empty-note">Nothing in progress.</div>}

      <div className="open-note">{openCount} OPEN · KEEP THE THREE PROTECTED.</div>

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
        />
      )}

      {error && <div className="toast">{error}</div>}
    </>
  );
}
