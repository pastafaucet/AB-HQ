"use client";

import { useState } from "react";
import type { Task } from "@/lib/data";
import type { ProjectRow, MatterOption } from "@/lib/queries";
import type { ProjectPatch } from "@/app/(app)/project-actions";
import ConfirmButton from "./ConfirmButton";
import { useEscapeClose } from "./drawers/bus";

const STATUSES = ["Active", "Done", "Archived"];
const MONTHS_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function fmtDue(iso: string, today: string): { label: string; cls: string } {
  const [, m, d] = iso.split("-").map(Number);
  const md = `${MONTHS_SHORT[m - 1]} ${d}`;
  if (iso < today) return { label: `${md} · OVD`, cls: "ptask-due over" };
  if (iso === today) return { label: "TODAY", cls: "ptask-due today" };
  return { label: md, cls: "ptask-due" };
}

export default function ProjectDrawer({
  project,
  matters,
  today,
  saving,
  saved,
  onField,
  onClose,
  onDelete,
  tasks,
  tasksLoading,
  onToggleTask,
  onAddTask,
  onOpenTask,
}: {
  project: ProjectRow;
  matters: MatterOption[];
  today: string;
  saving: boolean;
  saved: boolean;
  onField: (patch: ProjectPatch) => void;
  onClose: () => void;
  onDelete: () => void;
  tasks: Task[];
  tasksLoading: boolean;
  onToggleTask: (t: Task) => void;
  onAddTask: (title: string) => void;
  onOpenTask?: (taskId: string) => void;
}) {
  const [newTask, setNewTask] = useState("");

  useEscapeClose(onClose);

  function submitTask() {
    const title = newTask.trim();
    if (!title) return;
    setNewTask("");
    onAddTask(title);
  }

  const openTasks = tasks.filter((t) => t.status !== "Done");
  const doneTasks = tasks.filter((t) => t.status === "Done");

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-label="Edit project"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <span className="drawer-title-label">EDIT PROJECT</span>
          <span className="drawer-savestate">{saving ? "Saving…" : saved ? "Saved ✓" : ""}</span>
          <span className="head-spacer" />
          <span className="esc-keycap">ESC</span>
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <textarea
          className="drawer-title-input"
          placeholder="Project name…"
          value={project.name}
          rows={2}
          onChange={(e) => onField({ name: e.target.value })}
        />

        <div className="drawer-grid">
          <label className="drawer-field">
            <div className="drawer-label">CASE</div>
            <select
              className="drawer-select"
              value={project.matterId ?? ""}
              onChange={(e) => onField({ matterId: e.target.value || null })}
            >
              <option value="">— None —</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.closed ? " (closed)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="drawer-field">
            <div className="drawer-label">STATUS</div>
            <div className="seg-select">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`seg-opt${project.status === s ? " is-sel" : ""}`}
                  onClick={() => onField({ status: s })}
                >
                  {s}
                </button>
              ))}
            </div>
          </label>
        </div>

        <div className="drawer-grid">
          <label className="drawer-field">
            <div className="drawer-label">DEADLINE — THE TERMINAL DATE</div>
            <input
              type="date"
              className="drawer-select"
              value={project.deadline ?? ""}
              onChange={(e) => onField({ deadline: e.target.value || null })}
            />
          </label>
          <div className="drawer-field">
            <div className="drawer-label">PROGRESS</div>
            <div className="proj-progress-cell">
              {project.totalCount > 0 ? (
                <>
                  <div className="proj-bar">
                    <div
                      className="proj-bar-fill"
                      style={{
                        width: `${Math.round((project.doneCount / project.totalCount) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="proj-bar-label">
                    {project.doneCount}/{project.totalCount}
                  </span>
                </>
              ) : (
                <span className="proj-bar-label">No tasks yet</span>
              )}
            </div>
          </div>
        </div>

        <label className="drawer-field">
          <div className="drawer-label">NOTES</div>
          <textarea
            className="drawer-select proj-notes"
            placeholder="Strategy, posture, what done looks like…"
            rows={3}
            value={project.notes ?? ""}
            onChange={(e) => onField({ notes: e.target.value || null })}
          />
        </label>

        <div className="drawer-field">
          <div className="drawer-label">
            TASKS {openTasks.length > 0 ? `· ${openTasks.length} OPEN` : ""}
          </div>
          {tasksLoading && <div className="empty-note">Loading…</div>}
          {!tasksLoading && tasks.length === 0 && (
            <div className="empty-note">Nothing on this project yet.</div>
          )}
          {openTasks.map((t) => {
            const due = t.doDate ? fmtDue(t.doDate, today) : null;
            return (
              <div key={t.id} className="ptask-row">
                <button
                  type="button"
                  className="check ptask-check"
                  aria-label="Mark done"
                  onClick={() => onToggleTask(t)}
                />
                {onOpenTask ? (
                  <button type="button" className="ptask-title link-btn" onClick={() => onOpenTask(t.id)}>
                    {t.title}
                  </button>
                ) : (
                  <span className="ptask-title">{t.title}</span>
                )}
                {due && <span className={due.cls}>{due.label}</span>}
              </div>
            );
          })}
          {doneTasks.length > 0 && (
            <div className="ptask-done-group">
              {doneTasks.map((t) => (
                <div key={t.id} className="ptask-row is-done">
                  <button
                    type="button"
                    className="check ptask-check is-done"
                    aria-label="Reopen"
                    onClick={() => onToggleTask(t)}
                  >
                    ✓
                  </button>
                  <span className="ptask-title-done">{t.title}</span>
                </div>
              ))}
            </div>
          )}
          <input
            className="drawer-select ptask-add"
            placeholder="+  Add a task to this project…  (Enter)"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitTask();
            }}
          />
        </div>

        <div className="drawer-field">
          <ConfirmButton
            className="drawer-delete"
            label="Delete project"
            title="Tasks are kept — they just lose the project tag"
            onConfirm={onDelete}
          />
        </div>
      </div>
    </div>
  );
}
