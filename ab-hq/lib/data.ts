// ============================================================
// AB HQ — V1 data model (scope §4) + mock data for static UI.
// Priority is DERIVED from the Eisenhower flags, never stored.
// ============================================================

export type Domain = "Work" | "Personal" | "Health";
export type TaskType = "Task" | "Event" | "Deadline";
export type TaskStatus =
  | "Inbox"
  | "To Do"
  | "In Progress"
  | "Done"
  | "Someday"
  | "Cancelled";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  domain: Domain;
  type: TaskType;
  important: boolean;
  urgent: boolean;
  mit: boolean;
  doDate?: string;
  deadline?: string;
  matterId?: string;
  dueTag?: string; // display-only, e.g. "TODAY"
}

export interface Matter {
  id: string;
  name: string;
  client: string;
  stage: string;
  status: string; // Trial / Discovery / Settlement / Probate / On hold
  next?: string;
  nextColor?: string;
}

export interface Delegation {
  id: string;
  title: string;
  who: string;
  waiting: string; // e.g. "2d"
}

export interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  place: string;
  dot: string;
}

// --- Derived priority (Eisenhower → one label, scope §5) ---
export type PriorityLabel = "DO NOW" | "DEEP WORK" | "DELEGATE" | "LOW";

export function derivePriority(important: boolean, urgent: boolean): {
  label: PriorityLabel;
  cls: string; // priority chip class
} {
  if (important && urgent) return { label: "DO NOW", cls: "pri-p1" };
  if (important && !urgent) return { label: "DEEP WORK", cls: "pri-p3" };
  if (!important && urgent) return { label: "DELEGATE", cls: "pri-p2" };
  return { label: "LOW", cls: "pri-p4" };
}

export const DOMAIN_DOT: Record<Domain, string> = {
  Work: "#5b8cff",
  Personal: "#8b7cf0",
  Health: "#d88a6a",
};

export function kindClass(type: TaskType): string {
  if (type === "Event") return "kind-event";
  if (type === "Deadline") return "kind-deadline";
  return "kind-task";
}

// ============================================================
// Mock data — today is Saturday, July 5
// ============================================================

export const MATTERS: Matter[] = [
  { id: "m1", name: "Henderson v. Coastal", client: "R. Henderson", stage: "Trial", status: "Trial", next: "reply brief · today", nextColor: "var(--orange)" },
  { id: "m2", name: "Delgado v. Metro", client: "L. Delgado", stage: "Discovery", status: "Discovery", next: "depo · Jul 9", nextColor: "var(--muted)" },
  { id: "m3", name: "Whitfield Estate", client: "Whitfield", stage: "Probate", status: "Probate", next: "hearing · Jul 14", nextColor: "var(--muted)" },
  { id: "m4", name: "Okafor v. Summit", client: "D. Okafor", stage: "Discovery", status: "Discovery", next: "meet & confer · today", nextColor: "var(--orange)" },
];

// The three protected MITs for today (scope: max 3).
export const MITS: Task[] = [
  { id: "t1", title: "Finish reply brief — Henderson v. Coastal", status: "In Progress", domain: "Work", type: "Deadline", important: true, urgent: true, mit: true, matterId: "m1", dueTag: "DUE TODAY" },
  { id: "t2", title: "Prep Delgado deposition outline", status: "To Do", domain: "Work", type: "Task", important: true, urgent: false, mit: true, matterId: "m2" },
  { id: "t3", title: "Call Dr. Reyes re: expert report", status: "Done", domain: "Work", type: "Task", important: true, urgent: true, mit: true, matterId: "m3" },
];

export const ALSO_TODAY: Task[] = [
  { id: "t4", title: "Review discovery responses — Okafor", status: "To Do", domain: "Work", type: "Task", important: true, urgent: false, mit: false, matterId: "m4" },
  { id: "t5", title: "Sign engagement letter — Pearson intake", status: "To Do", domain: "Work", type: "Task", important: false, urgent: true, mit: false },
  { id: "t6", title: "Meet & confer call — Okafor", status: "To Do", domain: "Work", type: "Event", important: false, urgent: true, mit: false, matterId: "m4", dueTag: "4:30P" },
  { id: "t7", title: "Renew bar membership", status: "To Do", domain: "Personal", type: "Deadline", important: false, urgent: false, mit: false, dueTag: "JUL 31" },
];

export const IN_PROGRESS: Task[] = [
  { id: "t8", title: "Draft MSJ opposition — Coastal", status: "In Progress", domain: "Work", type: "Task", important: true, urgent: false, mit: false, matterId: "m1" },
  { id: "t9", title: "Outline settlement terms — Delgado", status: "In Progress", domain: "Work", type: "Task", important: false, urgent: false, mit: false, matterId: "m2" },
];

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
