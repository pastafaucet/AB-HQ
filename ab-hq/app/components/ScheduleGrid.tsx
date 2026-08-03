"use client";

import { useEffect, useState } from "react";
import { DAY_START_HOUR, DAY_END_HOUR } from "@/lib/data";

const HOUR_PX = 52;
const SNAP = 15;

export interface SchedItem {
  id: string;
  title: string;
  sub?: string;
  startMin: number;
  durMin: number;
  kind: "event" | "focus" | "task";
  num?: number;
  accent: string; // priority color for the left border
  done: boolean;
  canTimer: boolean;
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

type Drag = { id: string; startY: number; orig: number; cur: number; moved: boolean };

export default function ScheduleGrid({
  items,
  runningId,
  elapsed,
  onOpen,
  onToggle,
  onTimer,
  onUnschedule,
  onReschedule,
}: {
  items: SchedItem[];
  runningId: string | null;
  elapsed: string;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onTimer: (id: string) => void;
  onUnschedule: (id: string) => void;
  onReschedule: (id: string, startMin: number) => void;
}) {
  const startMin = DAY_START_HOUR * 60;
  const endMin = DAY_END_HOUR * 60;
  const height = ((endMin - startMin) / 60) * HOUR_PX;

  const hours: number[] = [];
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) hours.push(h);

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

  function down(e: React.PointerEvent, it: SchedItem) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: it.id, startY: e.clientY, orig: it.startMin, cur: it.startMin, moved: false });
  }
  function move(e: React.PointerEvent, dur: number) {
    if (!drag) return;
    const dm = Math.round(((e.clientY - drag.startY) / HOUR_PX) * 60 / SNAP) * SNAP;
    const cur = clamp(drag.orig + dm, startMin, endMin - dur);
    setDrag((d) => (d ? { ...d, cur, moved: d.moved || Math.abs(e.clientY - d.startY) > 3 } : d));
  }
  function up() {
    if (!drag) return;
    if (drag.moved) onReschedule(drag.id, drag.cur);
    else onOpen(drag.id);
    setDrag(null);
  }

  return (
    <div className="rail-block">
      <div className="rail-head">
        <div className="rail-label">SCHEDULE</div>
        <span className="section-link">Calendar →</span>
      </div>
      {items.length === 0 && (
        <div className="sched-empty">Set a time on a task to place it here.</div>
      )}
      <div className={`sched${drag ? " is-dragging" : ""}`} style={{ height }}>
        {hours.map((h) => (
          <div key={h} className="sched-hour" style={{ top: (h - DAY_START_HOUR) * HOUR_PX }}>
            <span className="sched-hourlabel">{fmtHour(h)}</span>
            <div className="sched-hourline" />
          </div>
        ))}
        {items.map((it) => {
          const s = drag?.id === it.id ? drag.cur : it.startMin;
          const top = ((s - startMin) / 60) * HOUR_PX;
          const h = Math.max((it.durMin / 60) * HOUR_PX, 26);
          const style: { top: number; height: number; borderLeftColor: string } = {
            top,
            height: h,
            borderLeftColor: it.accent,
          };
          const dragging = drag?.id === it.id;
          const running = runningId === it.id;
          return (
            <div
              key={it.id}
              className={`sched-block sched-${it.kind}${dragging ? " dragging" : ""}${it.done ? " done" : ""}`}
              style={style}
              onPointerDown={(e) => down(e, it)}
              onPointerMove={(e) => move(e, it.durMin)}
              onPointerUp={up}
            >
              <button
                className={`check sched-check${it.done ? " is-done" : ""}`}
                title={it.done ? "Mark not done" : "Mark done"}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(it.id);
                }}
              >
                {it.done ? "✓" : ""}
              </button>
              {it.num != null && <span className="sched-num">{it.num}</span>}
              <div className="sched-block-body">
                <div className={`sched-block-title${it.done ? " done" : ""}`}>{it.title}</div>
                {it.sub && !dragging && <div className="sched-block-sub">{it.sub}</div>}
              </div>
              {dragging ? (
                <span className="sched-drag-time">{fmtTime(s)}</span>
              ) : (
                <div className="sched-tools">
                  {it.canTimer && (
                    <button
                      className={`timer-btn sched-timer${running ? " running" : ""}`}
                      title={running ? "Stop timer" : "Start timer"}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTimer(it.id);
                      }}
                    >
                      {running && <span className="timer-elapsed">{elapsed}</span>}
                      <span className="timer-glyph">{running ? "⏹" : "▶"}</span>
                    </button>
                  )}
                  <button
                    className="sched-remove"
                    title="Remove from schedule"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnschedule(it.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {nowTop != null && <div className="sched-now" style={{ top: nowTop }} />}
      </div>
    </div>
  );
}
