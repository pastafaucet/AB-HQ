"use client";

import { useEffect } from "react";
import type {
  Task,
  Matter,
  Domain,
  TaskType,
  TaskStatus,
  Priority,
  TimeSession,
} from "@/lib/data";
import type { TaskPatch } from "@/app/(app)/task-actions";

const STATUSES: TaskStatus[] = ["Inbox", "To Do", "In Progress", "Done", "Someday", "Cancelled"];
const DOMAINS: Domain[] = ["Work", "Personal"];
const TYPES: TaskType[] = ["Task", "Deadline", "Event"];
const PRIORITIES: Priority[] = [1, 2, 3, 4];

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}
function fmtDur(startIso: string, endIso: string | null): string {
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const s = Math.max(0, Math.floor((end - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtTotal(list: TimeSession[]): string {
  let sec = 0;
  for (const s of list) {
    const end = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
    sec += Math.max(0, (end - new Date(s.startedAt).getTime()) / 1000);
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

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
  sessions,
  sessionsLoading,
  isRunning,
  liveElapsed,
  onStartStop,
  onSessionPatch,
  onSessionDelete,
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
  sessions: TimeSession[];
  sessionsLoading: boolean;
  isRunning: boolean;
  liveElapsed: string | null;
  onStartStop: () => void;
  onSessionPatch: (
    id: string,
    patch: { startedAt?: string; endedAt?: string | null; note?: string | null }
  ) => void;
  onSessionDelete: (id: string) => void;
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

        {!isNew && (
          <div className="drawer-field">
            <div className="drawer-label">TIME</div>
            <button
              type="button"
              className={`time-startstop${isRunning ? " on" : ""}`}
              onClick={onStartStop}
            >
              <span className="timer-glyph">{isRunning ? "⏹" : "▶"}</span>
              {isRunning ? `Stop · ${liveElapsed ?? ""}` : "Start timer"}
            </button>

            {sessionsLoading ? (
              <div className="drawer-hint-quiet">Loading sessions…</div>
            ) : sessions.length === 0 ? (
              <div className="drawer-hint-quiet">No sessions yet.</div>
            ) : (
              <div className="sess-list">
                {sessions.map((s) => (
                  <div className="sess-row" key={s.id}>
                    <div className="sess-times">
                      <input
                        type="datetime-local"
                        className="sess-input"
                        value={toLocalInput(s.startedAt)}
                        onChange={(e) =>
                          e.target.value &&
                          onSessionPatch(s.id, { startedAt: fromLocalInput(e.target.value) })
                        }
                      />
                      <span className="sess-dash">→</span>
                      {s.endedAt ? (
                        <input
                          type="datetime-local"
                          className="sess-input"
                          value={toLocalInput(s.endedAt)}
                          onChange={(e) =>
                            onSessionPatch(s.id, {
                              endedAt: e.target.value ? fromLocalInput(e.target.value) : null,
                            })
                          }
                        />
                      ) : (
                        <span className="sess-running">running</span>
                      )}
                      <span className="sess-dur">{fmtDur(s.startedAt, s.endedAt)}</span>
                      <button
                        type="button"
                        className="sess-del"
                        title="Delete session"
                        onClick={() => onSessionDelete(s.id)}
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      className="sess-note"
                      placeholder="What did you work on?"
                      defaultValue={s.note ?? ""}
                      onBlur={(e) => onSessionPatch(s.id, { note: e.target.value || null })}
                    />
                  </div>
                ))}
                <div className="sess-total">Total {fmtTotal(sessions)}</div>
              </div>
            )}
          </div>
        )}

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
