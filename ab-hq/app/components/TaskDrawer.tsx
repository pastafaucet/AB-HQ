"use client";

import { useEffect } from "react";
import type { Task, Matter, Domain, TaskType, TaskStatus, Priority } from "@/lib/data";
import type { TaskPatch } from "@/app/(app)/task-actions";

const STATUSES: TaskStatus[] = ["Inbox", "To Do", "In Progress", "Done", "Someday", "Cancelled"];
const DOMAINS: Domain[] = ["Work", "Personal"];
const TYPES: TaskType[] = ["Task", "Deadline", "Event"];
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
          <div className="drawer-label">TYPE</div>
          <div className="seg-select">
            {TYPES.map((ty) => (
              <button
                key={ty}
                type="button"
                className={`seg-opt${task.type === ty ? " is-sel" : ""}`}
                onClick={() => onField({ type: ty })}
              >
                {ty}
              </button>
            ))}
          </div>
        </div>

        <div className="drawer-field">
          <div className="mit-domain-row">
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
            <div className="seg-select domain-seg">
              {DOMAINS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`seg-opt${task.domain === d ? " is-sel" : ""}`}
                  onClick={() => onField({ domain: d })}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
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
            <select
              className="drawer-input drawer-dur"
              value={task.durationMin ?? ""}
              onChange={(e) =>
                onField({ durationMin: e.target.value ? Number(e.target.value) : null })
              }
              title="Duration on the schedule"
            >
              <option value="">— dur —</option>
              <option value="15">15m</option>
              <option value="30">30m</option>
              <option value="45">45m</option>
              <option value="60">1h</option>
              <option value="90">1.5h</option>
              <option value="120">2h</option>
            </select>
          </div>
          <div className="drawer-hint-quiet">
            Set a time to place this on today&rsquo;s schedule.
          </div>
        </div>

        <div className="drawer-field">
          <div className="drawer-label">NOTES</div>
          <textarea
            className="drawer-notes"
            placeholder="A few notes…"
            value={task.notes ?? ""}
            rows={4}
            onChange={(e) => onField({ notes: e.target.value })}
          />
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
