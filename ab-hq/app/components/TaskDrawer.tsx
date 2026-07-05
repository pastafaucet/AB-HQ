"use client";

import { useEffect } from "react";
import type { Task, Matter, Domain, TaskType, TaskStatus, Priority } from "@/lib/data";
import type { TaskPatch } from "@/app/(app)/task-actions";

const STATUSES: TaskStatus[] = ["Inbox", "To Do", "In Progress", "Done", "Someday", "Cancelled"];
const DOMAINS: Domain[] = ["Work", "Personal"];
const TYPES: TaskType[] = ["Task", "Event", "Deadline"];
const PRIORITIES: Priority[] = [1, 2, 3, 4];

export default function TaskDrawer({
  task,
  matters,
  mitCount,
  saving,
  saved,
  isNew,
  onField,
  onDelete,
  onClose,
}: {
  task: Task;
  matters: Matter[];
  mitCount: number;
  saving: boolean;
  saved: boolean;
  isNew: boolean;
  onField: (patch: TaskPatch) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mitDisabled = !task.mit && mitCount >= 3;

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-label={isNew ? "New task" : "Edit task"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <span className="drawer-title-label">{isNew ? "NEW TASK" : "EDIT TASK"}</span>
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <textarea
          className="drawer-title-input"
          placeholder="Task title…"
          value={task.title}
          rows={2}
          autoFocus
          onChange={(e) => onField({ title: e.target.value })}
        />

        <div className="drawer-field">
          <div className="drawer-label">PRIORITY</div>
          <div className="pri-select">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                className={`pri-opt${task.priority === p ? " is-sel" : ""}`}
                data-p={p}
                onClick={() => onField({ priority: p })}
              >
                P{p}
              </button>
            ))}
          </div>
        </div>

        <div className="drawer-field">
          <button
            type="button"
            className={`mit-toggle${task.mit ? " on" : ""}`}
            disabled={mitDisabled}
            title={mitDisabled ? "You already have 3 protected" : undefined}
            onClick={() => !mitDisabled && onField({ mit: !task.mit })}
          >
            <span className="mit-star">★</span>
            <span className="mit-toggle-label">MIT</span>
            <span className="mit-switch" aria-hidden />
          </button>
        </div>

        <div className="drawer-grid">
          <label className="drawer-field">
            <div className="drawer-label">STATUS</div>
            <select
              className="drawer-select"
              value={task.status}
              onChange={(e) => onField({ status: e.target.value })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="drawer-field">
            <div className="drawer-label">MATTER</div>
            <select
              className="drawer-select"
              value={task.matterId ?? ""}
              onChange={(e) => onField({ matterId: e.target.value || null })}
            >
              <option value="">— None —</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <label className="drawer-field">
            <div className="drawer-label">DOMAIN</div>
            <select
              className="drawer-select"
              value={task.domain}
              onChange={(e) => onField({ domain: e.target.value })}
            >
              {DOMAINS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="drawer-field">
            <div className="drawer-label">TYPE</div>
            <select
              className="drawer-select"
              value={task.type}
              onChange={(e) => onField({ type: e.target.value })}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="drawer-field">
          <div className="drawer-label">DO DATE</div>
          <div className="date-time-row">
            <input
              type="date"
              className="drawer-input"
              value={task.doDate ?? ""}
              onChange={(e) => onField({ doDate: e.target.value || null })}
            />
            <input
              type="time"
              className="drawer-input drawer-time"
              value={task.doTime ?? ""}
              onChange={(e) => onField({ doTime: e.target.value || null })}
            />
          </div>
        </div>

        <div className="drawer-footer">
          <span className="drawer-saved">
            {isNew ? "Type a title to save" : saving ? "Saving…" : saved ? "Saved ✓" : ""}
          </span>
          {!isNew && (
            <button className="drawer-delete" onClick={onDelete}>
              Delete task
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
