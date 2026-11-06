"use client";

import type { Task } from "@/lib/data";
import type { TaskPatch } from "@/app/(app)/task-actions";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * The task drawer's ENDS row. A later end date makes the item multi-day
 * (stored as end_date / end_time). On a single day, the end time is just
 * another way to set the duration: start + duration_min, one source of truth.
 */
export default function EndsField({
  task,
  onField,
}: {
  task: Task;
  onField: (patch: TaskPatch) => void;
}) {
  const multi = !!(task.doDate && task.endDate && task.endDate > task.doDate);
  const sameDayEnd =
    !multi && task.doTime && task.durationMin
      ? toHHMM(toMin(task.doTime) + task.durationMin)
      : "";

  function setDate(v: string) {
    if (!v || !task.doDate || v <= task.doDate) onField({ endDate: null, endTime: null });
    else onField({ endDate: v });
  }

  function setTime(v: string) {
    if (multi) {
      onField({ endTime: v || null });
      return;
    }
    if (!task.doTime) return;
    if (!v) {
      onField({ durationMin: null });
      return;
    }
    const diff = toMin(v) - toMin(task.doTime);
    if (diff > 0) onField({ durationMin: diff });
  }

  return (
    <div className="drawer-field">
      <div className="drawer-label">ENDS</div>
      <div className="due-cell">
        <input
          type="date"
          className="drawer-input"
          value={multi ? task.endDate : ""}
          min={task.doDate}
          disabled={!task.doDate}
          onChange={(e) => setDate(e.target.value)}
          aria-label="End date"
        />
        <input
          type="time"
          className="drawer-input"
          value={multi ? task.endTime ?? "" : sameDayEnd}
          disabled={!multi && !task.doTime}
          onChange={(e) => setTime(e.target.value)}
          aria-label="End time"
        />
      </div>
      <div className="drawer-hint-quiet">
        {multi
          ? "Shows on every day through the end date."
          : "Set a later date for trips and trial weeks. Same-day end time sets the length."}
      </div>
    </div>
  );
}
