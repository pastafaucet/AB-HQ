"use client";

import { useEffect, useState, type DragEvent, type PointerEvent } from "react";

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
  accent: string;
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
const snap = (mins: number) => Math.round(mins / SNAP) * SNAP;

type Drag = { id: string; startY: number; orig: number; cur: number; moved: boolean };
type Resize = { id: string; startY: number; orig: number; cur: number };

export default function ScheduleGrid({
  items,
  dayStartHour,
  dayEndHour,
  runningId,
  elapsed,
  onOpen,
  onToggle,
  onTimer,
  onUnschedule,
  onReschedule,
  onResize,
  onExternalDrop,
}: {
  items: SchedItem[];
  dayStartHour: number;
  dayEndHour: number;
  runningId: string | null;
  elapsed: string;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onTimer: (id: string) => void;
  onUnschedule: (id: string) => void;
  onReschedule: (id: string, startMin: number) => void;
  onResize: (id: string, durMin: number) => void;
  onExternalDrop: (id: string, startMin: number) => void;
}) {
  const startMin = dayStartHour * 60;
  const endMin = dayEndHour * 60;
  const height = ((endMin - startMin) / 60) * HOUR_PX;

  const hours: number[] = [];
  for (let h = dayStartHour; h <= dayEndHour; h++) hours.push(h);

  const [drag, setDrag] = useState<Drag | null>(null);
  const [resize, setResize] = useState<Resize | null>(null);
  const [dropMin, setDropMin] = useState<number | null>(null);
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

  // --- move a block (drag body) ---
  function downMove(e: PointerEvent, it: SchedItem) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: it.id, startY: e.clientY, orig: it.startMin, cur: it.startMin, moved: false });
  }
  function moveMove(e: PointerEvent, dur: number) {
    if (!drag) return;
    const cur = clamp(drag.orig + snap(((e.clientY - drag.startY) / HOUR_PX) * 60), startMin, endMin - dur);
    setDrag((d) => (d ? { ...d, cur, moved: d.moved || Math.abs(e.clientY - d.startY) > 3 } : d));
  }
  function upMove() {
    if (!drag) return;
    if (drag.moved) onReschedule(drag.id, drag.cur);
    else onOpen(drag.id);
    setDrag(null);
  }

  // --- resize a block (drag bottom edge) ---
  function downResize(e: PointerEvent, it: SchedItem) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setResize({ id: it.id, startY: e.clientY, orig: it.durMin, cur: it.durMin });
  }
  function moveResize(e: PointerEvent) {
    if (!resize) return;
    const cur = Math.max(SNAP, resize.orig + snap(((e.clientY - resize.startY) / HOUR_PX) * 60));
    setResize((r) => (r ? { ...r, cur } : r));
  }
  function upResize() {
    if (!resize) return;
    if (resize.cur !== resize.orig) onResize(resize.id, resize.cur);
    setResize(null);
  }

  // --- external drop (from the task list) ---
  function dropMinFrom(e: DragEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    return clamp(startMin + snap((y / HOUR_PX) * 60), startMin, endMin - SNAP);
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
    setDropMin(dropMinFrom(e));
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    const m = dropMinFrom(e);
    setDropMin(null);
    if (id) onExternalDrop(id, m);
  }

  return (
    <div className="rail-block">
      <div className="rail-head">
        <div className="rail-label">SCHEDULE</div>
        <span className="section-link">Calendar →</span>
      </div>
      {items.length === 0 && (
        <div className="sched-empty">Add an event with a time, or drag one here.</div>
      )}
      <div
        className={`sched${drag || resize ? " is-dragging" : ""}`}
        style={{ height }}
        onDragOver={onDragOver}
        onDragLeave={() => setDropMin(null)}
        onDrop={onDrop}
      >
        {hours.map((h) => (
          <div key={h} className="sched-hour" style={{ top: (h - dayStartHour) * HOUR_PX }}>
            <span className="sched-hourlabel">{fmtHour(h)}</span>
            <div className="sched-hourline" />
          </div>
        ))}
        {items.map((it) => {
          const s = drag?.id === it.id ? drag.cur : it.startMin;
          const dur = resize?.id === it.id ? resize.cur : it.durMin;
          const top = ((s - startMin) / 60) * HOUR_PX;
          const h = Math.max((dur / 60) * HOUR_PX, 22);
          const dragging = drag?.id === it.id;
          const running = runningId === it.id;
          return (
            <div
              key={it.id}
              className={`sched-block sched-${it.kind}${dragging ? " dragging" : ""}${it.done ? " done" : ""}`}
              style={{ top, height: h, borderLeftColor: it.accent }}
              onPointerDown={(e) => downMove(e, it)}
              onPointerMove={(e) => moveMove(e, dur)}
              onPointerUp={upMove}
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
                {it.sub && !dragging && h > 34 && <div className="sched-block-sub">{it.sub}</div>}
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
              <span
                className="sched-resize"
                title="Drag to resize"
                onPointerDown={(e) => downResize(e, it)}
                onPointerMove={moveResize}
                onPointerUp={upResize}
              />
            </div>
          );
        })}
        {dropMin != null && (
          <div className="sched-dropline" style={{ top: ((dropMin - startMin) / 60) * HOUR_PX }} />
        )}
        {nowTop != null && <div className="sched-now" style={{ top: nowTop }} />}
      </div>
    </div>
  );
}
