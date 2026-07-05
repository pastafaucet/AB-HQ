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

export interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  place: string;
  dot: string;
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

// --- Static rail data (not in the V1 data model yet) ---

export const SCHEDULE: ScheduleItem[] = [
  { id: "s1", time: "9:30a", title: "Motion hearing — Henderson", place: "Superior Ct · Dept 12", dot: "#5b8cff" },
  { id: "s2", time: "12:00p", title: "Lunch with co-counsel", place: "The Grill", dot: "#8b7cf0" },
  { id: "s3", time: "2:00p", title: "Delgado depo prep call", place: "Zoom", dot: "#5b8cff" },
  { id: "s4", time: "4:30p", title: "Meet & confer — Okafor", place: "Phone", dot: "#5b8cff" },
];

export const DELEGATIONS: Delegation[] = [
  { id: "d1", title: "Cite-check reply brief", who: "→ K. PARK", waiting: "2d" },
  { id: "d2", title: "Pull medical records — Delgado", who: "→ J. LIU", waiting: "4d" },
  { id: "d3", title: "Draft subpoena — Summit", who: "→ M. ORTIZ", waiting: "1d" },
];
