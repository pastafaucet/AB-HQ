"use client";

import { useState, useTransition } from "react";
import { editTimeEntry } from "@/app/(app)/hours-actions";
import type { HoursToday } from "@/lib/hours-sheet";
import { openCapture } from "./CaptureOverlay";

type Row = HoursToday["rows"][number];

/** The hours sheet's view of a day: its rows, the top strip, and any flags. Editable in place. */
export default function HoursTodayPanel({
  data,
  error,
  isToday,
}: {
  data: HoursToday | null;
  error: string | null;
  isToday: boolean;
}) {
  if (error || !data)
    return (
      <div className="hs-panel">
        <div className="section-label">HOURS SHEET</div>
        <div className="empty-note">{error ?? "Couldn't read the hours sheet."}</div>
      </div>
    );
  return (
    <div className="hs-panel">
      <div className="hs-strip">
        <div>
          <div className="hs-num">{data.today}</div>
          <div className="hs-lbl">TODAY (BILLABLE)</div>
        </div>
        <div>
          <div className="hs-num">{data.month}</div>
          <div className="hs-lbl">THIS MONTH</div>
        </div>
        <div className="hs-pace">
          <div className="hs-pace-txt">{data.pace}</div>
          <div className="hs-lbl">ON PACE FOR</div>
        </div>
      </div>
      <div className="section-label">
        IN THE HOURS SHEET · {data.rows.length} {isToday ? "TODAY" : "THAT DAY"}
        <button type="button" className="tc-link hs-add" onClick={() => openCapture()}>
          ＋ log time (⌘K)
        </button>
      </div>
      {data.rows.length === 0 && <div className="empty-note">Nothing logged for this day yet.</div>}
      {data.rows.map((r, i) => (
        <HoursRow key={`${r.client}-${i}-${r.description}`} row={r} />
      ))}
    </div>
  );
}

function HoursRow({ row }: { row: Row }) {
  const [cur, setCur] = useState(row);
  const [hours, setHours] = useState(String(row.hours));
  const [desc, setDesc] = useState(row.description);
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();

  function save(patch: { hours?: number; description?: string }) {
    const key = { date: cur.date, client: cur.client, description: cur.description };
    start(async () => {
      const r = await editTimeEntry(key, patch);
      setMsg(r.message);
      if (r.ok) setCur((c) => ({ ...c, hours: patch.hours ?? c.hours, description: patch.description ?? c.description }));
      else {
        setHours(String(cur.hours));
        setDesc(cur.description);
      }
    });
  }

  return (
    <div className="hs-row">
      <div className="hs-row-top">
        <span className="hs-client">{cur.client}</span>
        {cur.type === "Non-billable" && <span className="hs-tag">NB</span>}
        {cur.entered && <span className="hs-tag hs-entered">ENTERED</span>}
        <input
          className="hs-hours"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          onBlur={() => {
            const n = Number(hours);
            if (Number.isFinite(n) && n > 0 && n !== cur.hours) save({ hours: n });
            else setHours(String(cur.hours));
          }}
          aria-label="Hours"
        />
      </div>
      <textarea
        className="hs-desc"
        rows={1}
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onBlur={() => {
          if (desc.trim() && desc !== cur.description) save({ description: desc.trim() });
        }}
        aria-label="Description"
      />
      {cur.flag && <div className="tc-flag">Sheet check: {cur.flag}</div>}
      {msg && <div className="tc-note">{msg}</div>}
    </div>
  );
}
