import {
  Task,
  MATTERS,
  derivePriority,
  DOMAIN_DOT,
  kindClass,
} from "@/lib/data";

function scopeLabel(task: Task): string {
  if (task.matterId) {
    const m = MATTERS.find((x) => x.id === task.matterId);
    if (m) return m.name.toUpperCase();
  }
  return task.domain.toUpperCase();
}

export function TaskMeta({ task }: { task: Task }) {
  const pri = derivePriority(task.important, task.urgent);
  return (
    <div className="meta">
      <span className={`pri ${pri.cls}`}>{pri.label}</span>
      <span className="cat-dot" style={{ background: DOMAIN_DOT[task.domain] }} />
      <span className="meta-scope">{scopeLabel(task)}</span>
      <span className={kindClass(task.type)}>{task.type.toUpperCase()}</span>
      {task.dueTag && <span className="due-tag">{task.dueTag}</span>}
    </div>
  );
}

/** Static task row (checkbox is visual-only in V1 step 1). */
export default function TaskRow({ task }: { task: Task }) {
  const done = task.status === "Done";
  return (
    <div className="task-row">
      <div className={`check task-check${done ? " is-done" : ""}`}>
        {done ? "✓" : ""}
      </div>
      <div className="task-body">
        <div className={`task-title${done ? " is-done" : ""}`}>{task.title}</div>
        <TaskMeta task={task} />
      </div>
    </div>
  );
}
