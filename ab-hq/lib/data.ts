// ============================================================
// AB HQ — V1 data model (types + a little static data).
// Priority is an explicit P1–P4. Domains are Work / Personal.
// A task has a single "do date" plus an optional time.
// ============================================================

export type Domain = "Work" | "Personal";
export type TaskType = "Task" | "Event" | "Deadline";
export type TaskStatus =
  | "Inbox"
  | "To Do"
  | "In Progress"
  | "Done"
  | "Someday"
  | "Cancelled";
export type Priority = 1 | 2 | 3 | 4;

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  domain: Domain;
  type: TaskType;
  priority: Priority;
  mit: boolean;
  doDate?: string; // YYYY-MM-DD
  doTime?: string; // HH:MM
  durationMin?: number; // block length on the schedule
  matterId?: string;
  projectId?: string;
  notes?: string;
  dueTag?: string; // display-only (time / date)
  completedAt?: string; // ISO timestamp, set while status is Done
}

export interface Matter {
  id: string;
  name: string;
  client: string;
  stage: string;
  status: string;
  next?: string;
  nextColor?: string;
}

export type ProjectStatus = "Active" | "Done" | "Archived";

export interface Project {
  id: string;
  name: string;
  matterId?: string;
  deadline?: string; // YYYY-MM-DD — the terminal date
  status: ProjectStatus;
  notes?: string;
}

export type EntryKind = "log" | "task" | "note" | "event";
export type EntryStatus = "inbox" | "filed" | "dismissed";
export type WaitingOn = "Chris" | "Opposing Counsel" | "Court" | "Other";

export interface Entry {
  id: string;
  raw: string; // exactly what was typed — the permanent ledger record
  kind: EntryKind;
  status: EntryStatus;
  matterId?: string;
  projectId?: string;
  taskId?: string; // derived task, if routing created one
  summary?: string; // one-line normalization (billing narrative seed)
  routedBy?: "ai" | "manual";
  createdAt: string;
}

export interface TimeSession {
  id: string;
  taskId: string;
  startedAt: string; // ISO
  endedAt: string | null; // null = running
  note: string | null;
}

export interface RunningTimer {
  sessionId: string;
  taskId: string;
  startedAt: string;
}

export interface ActivityItem {
  id: string;
  taskId: string;
  detail: string;
  createdAt: string;
}

export interface Capacity {
  meetings: number; // hours
  focus: number;
  slack: number;
  note: string;
}

// P1 red · P2 green · P3 yellow · P4 gray
export const PRIORITY_META: Record<Priority, { label: string; cls: string }> = {
  1: { label: "P1", cls: "pri-p1" },
  2: { label: "P2", cls: "pri-p2" },
  3: { label: "P3", cls: "pri-p3" },
  4: { label: "P4", cls: "pri-p4" },
};

export const DOMAIN_DOT: Record<Domain, string> = {
  Work: "#5b8cff",
  Personal: "#8b7cf0",
};

export function kindClass(type: TaskType): string {
  if (type === "Event") return "kind-event";
  if (type === "Deadline") return "kind-deadline";
  return "kind-task";
}

// --- Static rail data (placeholder until an events/time model exists) ---

// Day-timeline bounds (whole hours).
export const DAY_START_HOUR = 8; // 8a
export const DAY_END_HOUR = 19; // 7p

