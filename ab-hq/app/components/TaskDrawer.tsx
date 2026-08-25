"use client";

import { useEffect, useState, type MouseEvent } from "react";
import type {
  Task,
  Matter,
  Project,
  Domain,
  TaskType,
  TaskStatus,
  Priority,
  TimeSession,
  ActivityItem,
} from "@/lib/data";
import type { TaskPatch } from "@/app/(app)/task-actions";
import { createProject } from "@/app/(app)/project-actions";
import ConfirmButton from "./ConfirmButton";

const STATUSES: TaskStatus[] = ["Inbox", "To Do", "In Progress", "Done", "Someday", "Cancelled"];
const DOMAINS: Domain[] = ["Work", "Personal"];
const TYPES: TaskType[] = ["Task", "Event", "Deadline"];
const PRIORITIES: Priority[] = [1, 2, 3, 4];

function toDateInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function toTimeInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
function combineDT(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}`).toISOString();
}
function fmtDatePill(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function openPicker(e: MouseEvent<HTMLElement>) {
  const inp = e.currentTarget.querySelector("input") as
    | (HTMLInputElement & { showPicker?: () => void })
    | null;
  try {
    inp?.showPicker?.();
  } catch {
    inp?.focus();
  }
}
function fmtTimeShort(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "p" : "a";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")}${ap}`;
}
function secBetween(startIso: string, endIso: string | null): number {
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  return Math.max(0, (end - new Date(startIso).getTime()) / 1000);
}
function fmtHM(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}
function fmtActDate(iso: string): string {
  return isToday(iso)
    ? "Today"
    : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TaskDrawer({
  task,
  matters,
  projects,
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
  onAddEntry,
  onSessionPatch,
  onSessionDelete,
  onMarkComplete,
  activity,
  activityLoading,
}: {
  task: Task;
  matters: Matter[];
  projects: Project[];
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
  onAddEntry: () => void;
  onSessionPatch: (
    id: string,
    patch: { startedAt?: string; endedAt?: string | null; note?: string | null }
  ) => void;
  onSessionDelete: (id: string) => void;
  onMarkComplete: () => void;
  activity: ActivityItem[];
  activityLoading: boolean;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  // Projects created from this drawer, so the select stays current without a reload.
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const [newProjOpen, setNewProjOpen] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const allProjects = [
    ...projects,
    ...localProjects.filter((lp) => !projects.some((p) => p.id === lp.id)),
  ];

  async function submitNewProject() {
    const name = newProjName.trim();
    if (!name) return;
    const r = await createProject(name, task.matterId ?? null);
    if (r.ok && r.project) {
      setLocalProjects((prev) => [...prev, r.project!]);
      onField({ projectId: r.project.id });
      setNewProjOpen(false);
      setNewProjName("");
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mitDisabled = !task.mit && mitCount >= 3;
  const done = task.status === "Done";
  const totalSec = sessions.reduce((a, s) => a + secBetween(s.startedAt, s.endedAt), 0);
  const todaySec = sessions
    .filter((s) => isToday(s.startedAt))
    .reduce((a, s) => a + secBetween(s.startedAt, s.endedAt), 0);

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
          <span className="drawer-savestate">
            {isNew ? "Type a title to save" : saving ? "Saving…" : saved ? "Saved ✓" : ""}
          </span>
          <span className="head-spacer" />
          <span className="esc-keycap">ESC</span>
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
          <div className="mit-status-row">
            <button
              type="button"
              className={`mit-toggle mit-compact${task.mit ? " on" : ""}`}
              disabled={mitDisabled}
              title={mitDisabled ? "You already have 3 protected" : undefined}
              onClick={() => !mitDisabled && onField({ mit: !task.mit })}
            >
              <span className="mit-star">★</span>
              <span className="mit-toggle-label">MIT</span>
              <span className="mit-switch" aria-hidden />
            </button>
            <select
              className="drawer-select status-inline"
              value={task.status}
              aria-label="Status"
              onChange={(e) => onField({ status: e.target.value })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
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
            <div className="drawer-label">PROJECT</div>
            {newProjOpen ? (
              <input
                type="text"
                className="drawer-select"
                placeholder="New project name…  (Enter)"
                autoFocus
                value={newProjName}
                onChange={(e) => setNewProjName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitNewProject();
                  }
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setNewProjOpen(false);
                  }
                }}
                onBlur={() => {
                  if (!newProjName.trim()) setNewProjOpen(false);
                }}
              />
            ) : (
              <select
                className="drawer-select"
                value={task.projectId ?? ""}
                onChange={(e) => {
                  if (e.target.value === "__new__") setNewProjOpen(true);
                  else onField({ projectId: e.target.value || null });
                }}
              >
                <option value="">— None —</option>
                {allProjects
                  .filter((p) => p.status === "Active" || p.id === task.projectId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                <option value="__new__">＋ New project…</option>
              </select>
            )}
          </label>
        </div>

        <div className="drawer-field">
          <div className="drawer-label">DUE</div>
          <div className="due-cell">
            <input
              type="date"
              className="drawer-input"
              value={task.doDate ?? ""}
              onChange={(e) => onField({ doDate: e.target.value || null })}
            />
            <input
              type="time"
              className="drawer-input"
              value={task.doTime ?? ""}
              onChange={(e) => onField({ doTime: e.target.value || null })}
            />
          </div>
        </div>

        <label className="drawer-field">
          <div className="drawer-label">ESTIMATE</div>
          <select
            className="drawer-select"
            value={task.durationMin ?? ""}
            onChange={(e) =>
              onField({ durationMin: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">— none —</option>
            <option value="15">15m</option>
            <option value="30">30m</option>
            <option value="45">45m</option>
            <option value="60">1h</option>
            <option value="90">1.5h</option>
            <option value="120">2h</option>
            <option value="180">3h</option>
            <option value="240">4h</option>
          </select>
          <div className="drawer-hint-quiet">Drives today&rsquo;s capacity (and, for events, the calendar block size).</div>
        </label>

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
            <div className="time-card">
              <div className="time-card-top">
                <div>
                  <div className="time-card-cap">TOTAL LOGGED</div>
                  <div className="time-card-total">{fmtHM(totalSec)}</div>
                  <div className="time-card-sub">
                    {todaySec > 0 ? `${fmtHM(todaySec)} logged today` : "nothing logged today"}
                  </div>
                </div>
                <button
                  type="button"
                  className={`time-startstop${isRunning ? " on" : ""}`}
                  onClick={onStartStop}
                >
                  <span className="timer-glyph">{isRunning ? "⏹" : "▶"}</span>
                  {isRunning ? `Stop · ${liveElapsed ?? ""}` : "Start timer"}
                </button>
              </div>
              <div className="time-card-foot">
                <button
                  type="button"
                  className="time-history-toggle"
                  onClick={() => setHistoryOpen((o) => !o)}
                >
                  {historyOpen ? "▾" : "▸"} {historyOpen ? "Hide history" : "Show history"} ·{" "}
                  {sessions.length}
                </button>
                <button
                  type="button"
                  className="time-add-entry"
                  onClick={() => {
                    onAddEntry();
                    setHistoryOpen(true);
                  }}
                >
                  + Add entry
                </button>
              </div>
              {historyOpen &&
                (sessionsLoading ? (
                  <div className="drawer-hint-quiet">Loading…</div>
                ) : sessions.length === 0 ? (
                  <div className="drawer-hint-quiet">No sessions yet.</div>
                ) : (
                  <div className="sess-list">
                    {sessions.map((s) => (
                      <div className="sess-row" key={s.id}>
                        <div className="sess-line">
                          <span className="ts-field ts-date" onClick={openPicker}>
                            <span className="ts-text">{fmtDatePill(s.startedAt)}</span>
                            <input
                              type="date"
                              className="ts-native"
                              value={toDateInput(s.startedAt)}
                              onChange={(e) => {
                                if (!e.target.value) return;
                                const startedAt = combineDT(e.target.value, toTimeInput(s.startedAt));
                                if (s.endedAt)
                                  onSessionPatch(s.id, {
                                    startedAt,
                                    endedAt: combineDT(e.target.value, toTimeInput(s.endedAt)),
                                  });
                                else onSessionPatch(s.id, { startedAt });
                              }}
                            />
                          </span>
                          <span className="ts-field" onClick={openPicker}>
                            <span className="ts-text">{fmtTimeShort(s.startedAt)}</span>
                            <input
                              type="time"
                              className="ts-native"
                              value={toTimeInput(s.startedAt)}
                              onChange={(e) =>
                                e.target.value &&
                                onSessionPatch(s.id, {
                                  startedAt: combineDT(toDateInput(s.startedAt), e.target.value),
                                })
                              }
                            />
                          </span>
                          <span className="sess-dash">–</span>
                          {s.endedAt ? (
                            <span className="ts-field" onClick={openPicker}>
                              <span className="ts-text">{fmtTimeShort(s.endedAt)}</span>
                              <input
                                type="time"
                                className="ts-native"
                                value={toTimeInput(s.endedAt)}
                                onChange={(e) =>
                                  e.target.value &&
                                  onSessionPatch(s.id, {
                                    endedAt: combineDT(toDateInput(s.endedAt!), e.target.value),
                                  })
                                }
                              />
                            </span>
                          ) : (
                            <span className="sess-running">running</span>
                          )}
                          <span className="sess-dur">{fmtHM(secBetween(s.startedAt, s.endedAt))}</span>
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
                          placeholder="Add a note…"
                          defaultValue={s.note ?? ""}
                          onBlur={(e) => onSessionPatch(s.id, { note: e.target.value || null })}
                        />
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          </div>
        )}

        {!isNew && (
          <div className="drawer-field">
            <div className="drawer-label">ACTIVITY</div>
            {activityLoading ? (
              <div className="drawer-hint-quiet">Loading…</div>
            ) : activity.length === 0 ? (
              <div className="drawer-hint-quiet">No activity yet.</div>
            ) : (
              <div className="act-list">
                {activity.map((a) => (
                  <div className="act-row" key={a.id}>
                    <span className="act-dot" />
                    <span className="act-detail">{a.detail}</span>
                    <span className="act-date">{fmtActDate(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!isNew && (
          <div className="mark-footer">
            <button
              type="button"
              className={`mark-complete${done ? " is-done" : ""}`}
              onClick={onMarkComplete}
            >
              {done ? "Reopen task" : "Mark complete"}
            </button>
            <ConfirmButton
              className="trash-btn"
              label="🗑"
              confirmLabel="Delete?"
              title="Delete task"
              onConfirm={onDelete}
            />
          </div>
        )}
      </div>
    </div>
  );
}
