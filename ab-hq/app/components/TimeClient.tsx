"use client";

import { useRouter } from "next/navigation";
import type { HoursToday } from "@/lib/hours-sheet";
import { todayISO } from "@/lib/task-map";
import HoursTodayPanel from "./HoursTodayPanel";
import HoursCalendar from "./HoursCalendar";

// Work → Time: the hours Google Sheet's view of a day (the sheet is the
// record), with a month calendar to move between days. Time is logged from
// Capture: "AB 218 - review memo (.4)".
export default function TimeClient({
  date,
  month,
  hours,
  hoursError,
  clients,
}: {
  date: string;
  month: string;
  hours: HoursToday | null;
  hoursError: string | null;
  clients: { name: string; increment: number }[];
}) {
  const router = useRouter();
  const today = todayISO();
  const isToday = date === today;
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
  });

  const go = (d: string, m?: string) => {
    const q = new URLSearchParams();
    if (d !== today) q.set("date", d);
    if (m && m !== d.slice(0, 7)) q.set("month", m);
    router.push(q.size ? `/work/time?${q}` : "/work/time");
  };

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">WORK · HOURS SHEET</div>
            <h1 className="display-h1">{isToday ? "Today" : dateLabel}</h1>
          </div>
        </div>
        <HoursTodayPanel key={date} data={hours} error={hoursError} isToday={isToday} clients={clients} />
      </section>
      <aside className="rail">
        <HoursCalendar
          month={month}
          selected={date}
          today={today}
          days={hours?.days ?? {}}
          onPickDay={(d) => go(d)}
          onMonth={(m) => go(date, m)}
        />
      </aside>
    </>
  );
}
