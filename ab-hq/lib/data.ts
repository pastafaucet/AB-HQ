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
  matterId?: string;
  notes?: string;
  dueTag?: string; // display-only (time / date)
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

export interface Delegation {
  id: string;
  title: string;
  who: string;
  waiting: string;
}

export type BlockKind = "event" | "lunch" | "focus" | "personal";

export interface DayBlock {
  id: string;
  title: string;
  sub?: string;
  start: string; // "HH:MM" 24h
  end: string;
  kind: BlockKind;
  num?: number; // MIT number when a focus block is a Top-3
  dot?: string; // accent dot for events
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

export const CAPACITY: Capacity = {
  meetings: 2.3,
  focus: 4.0,
  slack: 3.3,
  note: "heavy — all high-stakes",
};

export const DAY_SCHEDULE: DayBlock[] = [
  { id: "b1", title: "Motion hearing — Castillo", sub: "9:30a · Dept 4", start: "09:30", end: "10:30", kind: "event", dot: "#5b8cff" },
  { id: "b2", title: "Call expert — Dr. Mehta", start: "11:00", end: "11:30", kind: "event", dot: "#5b8cff" },
  { id: "b3", title: "Lunch", start: "12:00", end: "12:45", kind: "lunch" },
  { id: "b4", title: "Client call — Ana Reyes", sub: "1p · Coastal Freight", start: "13:00", end: "13:45", kind: "event", dot: "#8b7cf0" },
  { id: "b5", title: "Finalize reply brief", start: "14:00", end: "16:30", kind: "focus", num: 1 },
  { id: "b6", title: "Depo prep outline", start: "17:00", end: "18:00", kind: "focus", num: 2 },
  { id: "b7", title: "Dive club — gear check", start: "18:30", end: "19:00", kind: "personal" },
];

export const DELEGATIONS: Delegation[] = [
  { id: "d1", title: "Cite-check reply brief", who: "→ K. PARK", waiting: "2d" },
  { id: "d2", title: "Pull medical records — Delgado", who: "→ J. LIU", waiting: "4d" },
  { id: "d3", title: "Draft subpoena — Summit", who: "→ M. ORTIZ", waiting: "1d" },
];
