"use client";

import { useEffect, useRef, useState } from "react";
import { DAY_SCHEDULE, DAY_START_HOUR, DAY_END_HOUR } from "@/lib/data";

const HOUR_PX = 52;
const SNAP = 15; // minutes
const STORE_KEY = "abhq.schedule.overrides";

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
function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ap = h >= 12 ? "p" : "a";
  let x = h % 12;
  if (x === 0) x = 12;
  return `${x}:${String(m).padStart(2, "0")}${ap}`;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Drag = { id: string; startY: number; orig: number; cur: number };

export default function ScheduleGrid() {
  const startMin = DAY_START_HOUR * 60;
  const endMin = DAY_END_HOUR * 60;
  const height = ((endMin - startMin) / 60) * HOUR_PX;

  const hours: number[] = [];
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) hours.push(h);

  // duration per block (fixed) + the current start (override-able)
  const durById = useRef<Record<string, number>>({});
  DAY_SCHEDULE.forEach((b) => (durById.current[b.id] = toMin(b.end) - toMin(b.start)));

  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [drag, setDrag] = useState<Drag | null>(null);

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

  // load saved positions (client only — avoids hydration mismatch)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) setOverrides(JSON.parse(raw));
    } catch {}
  }, []);

  function startAt(id: string, base: number): number {
    if (drag && drag.id === id) return drag.cur;
    return overrides[id] ?? base;
  }

  function onPointerDown(e: React.PointerEvent, id: string, cur: number) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, startY: e.clientY, orig: cur, cur });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const deltaMin = Math.round(((e.clientY - drag.startY) / HOUR_PX) * 60 / SNAP) * SNAP;
    const dur = durById.current[drag.id] ?? 30;
    const cur = clamp(drag.orig + deltaMin, startMin, endMin - dur);
    setDrag((d) => (d ? { ...d, cur } : d));
  }
  function onPointerUp() {
    if (!drag) return;
    const next = { ...overrides, [drag.id]: drag.cur };
    setOverrides(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {}
    setDrag(null);
  }

  return (
    <div className="rail-block">
      <div className="rail-head">
        <div className="rail-label">SCHEDULE</div>
        <span className="section-link">Calendar →</span>
      </div>
      <div className={`sched${drag ? " is-dragging" : ""}`} style={{ height }}>
        {hours.map((h) => (
          <div key={h} className="sched-hour" style={{ top: (h - DAY_START_HOUR) * HOUR_PX }}>
            <span className="sched-hourlabel">{fmtHour(h)}</span>
            <div className="sched-hourline" />
          </div>
        ))}
        {DAY_SCHEDULE.map((b) => {
          const s = startAt(b.id, toMin(b.start));
          const dur = durById.current[b.id];
          const top = ((s - startMin) / 60) * HOUR_PX;
          const h = Math.max((dur / 60) * HOUR_PX, 20);
          const style: { top: number; height: number; borderLeftColor?: string } = { top, height: h };
          if (b.dot) style.borderLeftColor = b.dot;
          const dragging = drag?.id === b.id;
          return (
            <div
              key={b.id}
              className={`sched-block sched-${b.kind}${dragging ? " dragging" : ""}`}
              style={style}
              onPointerDown={(e) => onPointerDown(e, b.id, s)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {b.num != null && <span className="sched-num">{b.num}</span>}
              <div className="sched-block-body">
                <div className="sched-block-title">{b.title}</div>
                {b.sub && !dragging && <div className="sched-block-sub">{b.sub}</div>}
              </div>
              {dragging && <span className="sched-drag-time">{fmtTime(s)}</span>}
            </div>
          );
        })}
        {nowTop != null && <div className="sched-now" style={{ top: nowTop }} />}
      </div>
    </div>
  );
}
