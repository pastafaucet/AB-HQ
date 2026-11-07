"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Task } from "@/lib/data";
import type { ProjectRow, MatterOption } from "@/lib/queries";
import {
  updateProject,
  deleteProject,
  listProjectTasks,
  type ProjectPatch,
} from "@/app/(app)/project-actions";
import { createTask, setTaskDone } from "@/app/(app)/task-actions";
import ProjectDrawer from "../ProjectDrawer";
import { emitChange, openDrawer, useDrawerChanges, applyChange } from "./bus";

function applyProjectPatch(p: ProjectRow, patch: ProjectPatch, matters: MatterOption[]): ProjectRow {
  const next = { ...p };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.matterId !== undefined) {
    next.matterId = patch.matterId;
    next.matterName = patch.matterId
      ? matters.find((m) => m.id === patch.matterId)?.name ?? null
      : null;
  }
  if (patch.deadline !== undefined) next.deadline = patch.deadline;
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.notes !== undefined) next.notes = patch.notes;
  return next;
}

function fullProjectPatch(p: ProjectRow): ProjectPatch {
  return { name: p.name, matterId: p.matterId, deadline: p.deadline, status: p.status, notes: p.notes };
}

/** A project drawer that owns its own loading and saving (Projects hub + drawer host). */
export default function ProjectDrawerContainer({
  project,
  matters,
  today,
  onClose,
}: {
  project: ProjectRow;
  matters: MatterOption[];
  today: string;
  onClose: () => void;
}) {
  const [row, setRow] = useState<ProjectRow>(project);
  const rowRef = useRef(row);
  useEffect(() => {
    rowRef.current = row;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await listProjectTasks(project.id);
      if (!live) return;
      setTasksLoading(false);
      if (r.ok) setTasks(r.tasks);
    })();
    return () => {
      live = false;
    };
  }, [project.id]);

  // A task edited in its own drawer (opened from this one) updates the list here.
  useDrawerChanges<Task>("task", (d) => setTasks((prev) => applyChange(prev, d)));

  function commit(next: ProjectRow) {
    rowRef.current = next;
    setRow(next);
    emitChange({ kind: "project", id: next.id, row: next });
  }

  function onField(patch: ProjectPatch) {
    commit(applyProjectPatch(rowRef.current, patch, matters));
    setSaving(true);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const p = rowRef.current;
      startTransition(async () => {
        const r = await updateProject(p.id, fullProjectPatch(p));
        setSaving(false);
        if (r.ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        } else flash(r.error ?? "Couldn't save.");
      });
    }, 450);
  }

  function close() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      const p = rowRef.current;
      startTransition(async () => void (await updateProject(p.id, fullProjectPatch(p))));
    }
    onClose();
  }

  function onDelete() {
    const id = rowRef.current.id;
    emitChange({ kind: "project", id, deleted: true });
    onClose();
    startTransition(async () => {
      await deleteProject(id);
    });
  }

  function onToggleTask(t: Task) {
    const done = t.status !== "Done";
    const updated: Task = { ...t, status: done ? "Done" : "To Do" };
    setTasks((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    emitChange({ kind: "task", id: t.id, row: updated });
    const cur = rowRef.current;
    commit({
      ...cur,
      openCount: cur.openCount + (done ? -1 : 1),
      doneCount: cur.doneCount + (done ? 1 : -1),
    });
    startTransition(async () => {
      const r = await setTaskDone(t.id, done);
      if (!r.ok) flash(r.error ?? "Couldn't save.");
    });
  }

  function onAddTask(title: string) {
    const cur = rowRef.current;
    startTransition(async () => {
      const r = await createTask({ title, status: "To Do", projectId: cur.id, matterId: cur.matterId ?? null });
      if (r.ok && r.task) {
        setTasks((prev) => [...prev, r.task!]);
        const now = rowRef.current;
        commit({ ...now, openCount: now.openCount + 1, totalCount: now.totalCount + 1 });
      } else flash(r.error ?? "Couldn't add task.");
    });
  }

  return (
    <>
      <ProjectDrawer
        project={row}
        matters={matters}
        today={today}
        saving={saving}
        saved={saved}
        onField={onField}
        onClose={close}
        onDelete={onDelete}
        tasks={tasks}
        tasksLoading={tasksLoading}
        onToggleTask={onToggleTask}
        onAddTask={onAddTask}
        onOpenTask={(id) => openDrawer("task", id)}
      />
      {error && <div className="toast">{error}</div>}
    </>
  );
}
