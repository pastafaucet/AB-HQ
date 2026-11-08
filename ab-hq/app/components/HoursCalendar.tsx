"use client";

import type { HoursToday } from "@/lib/hours-sheet";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const fmt = (n: number) => (n === 0 ? "" : n.toFixed(n * 10 === Math.round(n * 10) ? 1 : 2));

/** A month of days with each day's billable hours from the sheet. Click a day to open it. */
export default function HoursCalendar({
  month,
  selected,
  today,
  days,
  onPickDay,
  onMonth,
}: {
  month: string; // YYYY-MM
  selected: string;
  today: string;
  days: HoursToday["days"];
  onPickDay: (iso: string) => void;
  onMonth: (month: string) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    onMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const billable = Object.values(days).reduce((a, d) => a + d.billable, 0);
  const nb = Object.values(days).reduce((a, d) => a + d.nonBillable, 0);

  return (
    <div className="hc">
      <div className="hc-head">
        <button type="button" className="ov-chip" onClick={() => shift(-1)} aria-label="Previous month">
          ←
        </button>
        <div className="hc-title">
          {MONTHS[m - 1]} {y}
        </div>
        <button type="button" className="ov-chip" onClick={() => shift(1)} aria-label="Next month">
          →
        </button>
      </div>
      <div className="hc-total">
        {billable.toFixed(2)} billable{nb > 0 ? ` · ${nb.toFixed(2)} non-billable` : ""}
      </div>
      <div className="hc-grid">
        {DOW.map((d, i) => (
          <div key={i} className="hc-dow">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="hc-cell is-empty" />;
          const day = iso(y, m, d);
          const t = days[day];
          return (
            <button
              key={i}
              type="button"
              className="hc-cell"
              data-selected={day === selected}
              data-today={day === today}
              data-future={day > today}
              onClick={() => onPickDay(day)}
            >
              <span className="hc-day">{d}</span>
              <span className="hc-hours">{t ? fmt(t.billable) : ""}</span>
              {t && t.nonBillable > 0 && <span className="hc-nb">{fmt(t.nonBillable)}</span>}
            </button>
          );
        })}
      </div>
      {month !== today.slice(0, 7) && (
        <button type="button" className="tc-link hc-today" onClick={() => onPickDay(today)}>
          Back to today
        </button>
      )}
    </div>
  );
}
