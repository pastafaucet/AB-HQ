"use client";

import { useState, useTransition } from "react";
import type { HabitRow, BodyRow } from "@/lib/queries";
import {
  addHabit,
  archiveHabit,
  setHabitChecked,
  saveBodyMetrics,
  type BodyPatch,
} from "@/app/(app)/life-actions";
import ConfirmButton from "./ConfirmButton";

// Shared life-tracking widgets: the habit checklist and the body-metrics
// form. Both rituals render them against the same per-day state.

export function HabitChecklist({
  habits: initialHabits,
  today,
  onError,
}: {
  habits: HabitRow[];
  today: string;
  onError: (msg: string) => void;
}) {
  const [habits, setHabits] = useState<HabitRow[]>(initialHabits);
  const [adding, setAdding] = useState("");
  const [, startTransition] = useTransition();

  function toggle(h: HabitRow) {
    const checked = !h.checkedToday;
    setHabits((prev) =>
      prev.map((x) =>
        x.id === h.id
          ? { ...x, checkedToday: checked, streak: Math.max(0, x.streak + (checked ? 1 : -1)) }
          : x
      )
    );
    startTransition(async () => {
      const r = await setHabitChecked(h.id, today, checked);
      if (!r.ok) onError(r.error ?? "Couldn't save.");
    });
  }

  function submitAdd() {
    const name = adding.trim();
    if (!name) return;
    setAdding("");
    startTransition(async () => {
      const r = await addHabit(name);
      if (r.ok && r.id) {
        setHabits((prev) => [...prev, { id: r.id!, name, checkedToday: false, streak: 0 }]);
      } else onError(r.error ?? "Couldn't add habit.");
    });
  }

  function onArchive(id: string) {
    setHabits((prev) => prev.filter((h) => h.id !== id));
    startTransition(async () => {
      const r = await archiveHabit(id);
      if (!r.ok) onError(r.error ?? "Couldn't remove.");
    });
  }

  return (
    <div className="habit-list">
      {habits.map((h) => (
        <div key={h.id} className="habit-row">
          <button
            type="button"
            className={`check habit-check${h.checkedToday ? " is-done" : ""}`}
            aria-label={h.checkedToday ? "Uncheck" : "Check"}
            onClick={() => toggle(h)}
          >
            {h.checkedToday ? "✓" : ""}
          </button>
          <span className={`habit-name${h.checkedToday ? " is-done" : ""}`}>{h.name}</span>
          {h.streak > 1 && <span className="habit-streak">{h.streak}d</span>}
          <ConfirmButton
            className="habit-x"
            label="✕"
            confirmLabel="?"
            title="Retire this habit (history kept)"
            onConfirm={() => onArchive(h.id)}
          />
        </div>
      ))}
      <input
        className="habit-add"
        placeholder="+ habit…"
        value={adding}
        onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submitAdd();
        }}
      />
    </div>
  );
}

const FIELDS: {
  key: keyof BodyPatch;
  label: string;
  unit: string;
  step: string;
  when: "morning" | "evening";
}[] = [
  { key: "weightLbs", label: "WEIGHT", unit: "lbs", step: "0.1", when: "morning" },
  { key: "sleepHours", label: "SLEEP", unit: "h", step: "0.1", when: "morning" },
  { key: "calories", label: "CALS", unit: "kcal", step: "1", when: "evening" },
  { key: "proteinG", label: "PROTEIN", unit: "g", step: "1", when: "evening" },
  { key: "carbsG", label: "CARBS", unit: "g", step: "1", when: "evening" },
  { key: "fatG", label: "FAT", unit: "g", step: "1", when: "evening" },
];

export function BodyForm({
  body,
  today,
  mode,
  onError,
}: {
  body: BodyRow | null;
  today: string;
  mode: "morning" | "evening"; // morning: weight+sleep; evening: everything
  onError: (msg: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({
    weightLbs: body?.weightLbs?.toString() ?? "",
    sleepHours: body?.sleepHours?.toString() ?? "",
    calories: body?.calories?.toString() ?? "",
    proteinG: body?.proteinG?.toString() ?? "",
    carbsG: body?.carbsG?.toString() ?? "",
    fatG: body?.fatG?.toString() ?? "",
  });
  const [workout, setWorkout] = useState(body?.workout ?? "");
  const [, startTransition] = useTransition();

  const fields = FIELDS.filter((f) => mode === "evening" || f.when === "morning");

  function saveField(key: keyof BodyPatch, raw: string) {
    const n = raw.trim() === "" ? null : Number(raw);
    if (n !== null && (!isFinite(n) || n < 0)) return;
    startTransition(async () => {
      const r = await saveBodyMetrics(today, { [key]: n } as BodyPatch);
      if (!r.ok) onError(r.error ?? "Couldn't save.");
    });
  }

  return (
    <div className="body-form">
      <div className="body-grid">
        {fields.map((f) => (
          <label key={f.key} className="body-field">
            <span className="body-label">{f.label}</span>
            <input
              type="number"
              step={f.step}
              min="0"
              className="body-input"
              value={values[f.key as string]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key as string]: e.target.value }))}
              onBlur={(e) => saveField(f.key, e.target.value)}
            />
            <span className="body-unit">{f.unit}</span>
          </label>
        ))}
      </div>
      {mode === "evening" && (
        <textarea
          className="intent-input body-workout"
          placeholder="Workout — what you did, details, how it felt…"
          rows={2}
          value={workout}
          onChange={(e) => setWorkout(e.target.value)}
          onBlur={(e) =>
            startTransition(async () => {
              const r = await saveBodyMetrics(today, { workout: e.target.value.trim() || null });
              if (!r.ok) onError(r.error ?? "Couldn't save.");
            })
          }
        />
      )}
    </div>
  );
}
