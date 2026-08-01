"use client";

import { useEffect, useState } from "react";
import { DAY_SCHEDULE, DAY_START_HOUR, DAY_END_HOUR } from "@/lib/data";

const HOUR_PX = 52;

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function fmtHour(h: number): string {
  const ap = h >= 12 ? "p" : "a";
  let x = h % 12;
  if (x === 0) x = 12;
  return `${x}${ap}`;
}

// Placeholder day-timeline — static blocks, live "now" line.
export default function ScheduleGrid() {
  const startMin = DAY_START_HOUR * 60;
  const endMin = DAY_END_HOUR * 60;
  const height = ((endMin - startMin) / 60) * HOUR_PX;

  const hours: number[] = [];
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) hours.push(h);

  const [nowTop, setNowTop] = useState<number | null>(null);
  useEffect(() => {
    const upd = () => {
      const d = new Date();
      const m = d.getHours() * 60 + d.getMinutes();
      setNowTop(m >= startMin && m <= endMin ? ((m - startMin) / 60) * HOUR_PX : null);
    };
    upd();
    const t = setInterval(upd, 60000);
    return () => clearInterval(t);
  }, [startMin, endMin]);

  return (
    <div className="rail-block">
      <div className="rail-head">
        <div className="rail-label">SCHEDULE</div>
        <span className="section-link">Calendar →</span>
      </div>
      <div className="sched" style={{ height }}>
        {hours.map((h) => (
          <div key={h} className="sched-hour" style={{ top: (h - DAY_START_HOUR) * HOUR_PX }}>
            <span className="sched-hourlabel">{fmtHour(h)}</span>
            <div className="sched-hourline" />
          </div>
        ))}
        {DAY_SCHEDULE.map((b) => {
          const top = ((toMin(b.start) - startMin) / 60) * HOUR_PX;
          const h = Math.max(((toMin(b.end) - toMin(b.start)) / 60) * HOUR_PX, 20);
          const style: { top: number; height: number; borderLeftColor?: string } = { top, height: h };
          if (b.dot) style.borderLeftColor = b.dot;
          return (
            <div key={b.id} className={`sched-block sched-${b.kind}`} style={style}>
              {b.num != null && <span className="sched-num">{b.num}</span>}
              <div className="sched-block-body">
                <div className="sched-block-title">{b.title}</div>
                {b.sub && <div className="sched-block-sub">{b.sub}</div>}
              </div>
            </div>
          );
        })}
        {nowTop != null && <div className="sched-now" style={{ top: nowTop }} />}
      </div>
    </div>
  );
}
