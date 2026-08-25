import type { Task, Domain, TaskStatus, TaskType, Priority } from "@/lib/data";
import { dueTagFor } from "@/lib/task-map";
import type { TaskPatch } from "@/app/(app)/task-actions";

// Shared client-side task ⇄ patch mapping, used by every surface that
// edits tasks optimistically (My Day, Tasks hub).

export function applyPatch(t: Task, p: TaskPatch, today: string): Task {
  const next: Task = { ...t };
  if (p.title !== undefined) next.title = p.title;
  if (p.priority !== undefined) next.priority = p.priority as Priority;
  if (p.mit !== undefined) next.mit = p.mit;
  if (p.status !== undefined) next.status = p.status as TaskStatus;
  if (p.domain !== undefined) next.domain = p.domain as Domain;
  if (p.type !== undefined) next.type = p.type as TaskType;
  if (p.matterId !== undefined) next.matterId = p.matterId ?? undefined;
  if (p.projectId !== undefined) next.projectId = p.projectId ?? undefined;
  if (p.waitingOn !== undefined) next.waitingOn = (p.waitingOn as Task["waitingOn"]) ?? undefined;
  if (p.doDate !== undefined) next.doDate = p.doDate ?? undefined;
  if (p.doTime !== undefined) next.doTime = p.doTime ?? undefined;
  if (p.durationMin !== undefined) next.durationMin = p.durationMin ?? undefined;
  if (p.notes !== undefined) next.notes = p.notes ?? undefined;
  if (p.doDate !== undefined || p.doTime !== undefined) {
    next.dueTag = dueTagFor(next.doDate ?? null, next.doTime ?? null, today);
  }
  return next;
}

export function fullPatch(t: Task): TaskPatch {
  return {
    title: t.title,
    priority: t.priority,
    mit: t.mit,
    status: t.status,
    domain: t.domain,
    type: t.type,
    matterId: t.matterId ?? null,
    projectId: t.projectId ?? null,
    waitingOn: t.waitingOn ?? null,
    doDate: t.doDate ?? null,
    doTime: t.doTime ?? null,
    durationMin: t.durationMin ?? null,
    notes: t.notes ?? null,
  };
}
