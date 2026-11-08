"use client";

import { useRouter } from "next/navigation";
import type { HoursToday } from "@/lib/hours-sheet";
import { todayISO } from "@/lib/task-map";
import HoursTodayPanel from "./HoursTodayPanel";

// Work → Time: the hours Google Sheet's view of a day (the sheet is the
// record). Time is logged from Capture: "AB 218 - review memo (.4)".
export default function TimeClient({
  date,
  hours,
  hoursError,
}: {
  date: string;
  hours: HoursToday | null;
  hoursError: string | null;
}) {
  const router = useRouter();
  const isToday = date === todayISO();
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  function shiftDay(delta: number) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + delta);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    router.push(iso === todayISO() ? "/work/time" : `/work/time?date=${iso}`);
  }

  return (
    <section className="pane">
      <div className="day-head">
        <div>
          <div className="kicker">WORK · HOURS SHEET</div>
          <h1 className="display-h1">Time</h1>
        </div>
      </div>
      <div className="ledger-datebar">
        <button className="ov-chip" type="button" onClick={() => shiftDay(-1)}>
          ← PREV
        </button>
        <span className="ledger-date">{dateLabel}</span>
        <button className="ov-chip" type="button" onClick={() => shiftDay(1)} disabled={isToday}>
          NEXT →
        </button>
      </div>
      <HoursTodayPanel data={hours} error={hoursError} isToday={isToday} />
    </section>
  );
}
