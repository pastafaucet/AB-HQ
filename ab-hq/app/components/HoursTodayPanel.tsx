"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTimeEntry, saveTimeEdit } from "@/app/(app)/hours-actions";
import type { HoursToday } from "@/lib/hours-sheet";
import { formatHours } from "@/lib/time-entry";
import { openCapture } from "./CaptureOverlay";

type Row = HoursToday["rows"][number];
type ClientOpt = { name: string; increment: number };

/** The hours sheet's view of a day: the top strip, its rows and flags. Each row can be edited or removed. */
export default function HoursTodayPanel({
  data,
  error,
  isToday,
  clients,
}: {
  data: HoursToday | null;
  error: string | null;
  isToday: boolean;
  clients: ClientOpt[];
}) {
  if (error || !data)
    return (
      <div className="hs-panel">
        <div className="section-label">HOURS SHEET</div>
        <div className="empty-note">{error ?? "Couldn't read the hours sheet."}</div>
      </div>
    );
  const dayTotal = data.rows.reduce((a, r) => a + (r.type === "Non-billable" ? 0 : r.hours), 0);
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
        {isToday ? "TODAY" : "THIS DAY"} · {data.rows.length} {data.rows.length === 1 ? "ENTRY" : "ENTRIES"}
        {data.rows.length > 0 && ` · ${dayTotal.toFixed(2)} BILLABLE`}
        <button type="button" className="tc-link hs-add" onClick={() => openCapture()}>
          ＋ log time (⌘K)
        </button>
      </div>
      {data.rows.length === 0 && <div className="empty-note">Nothing logged for this day.</div>}
      {data.rows.map((r, i) => (
        <HoursRow key={`${r.client}-${i}-${r.description}`} row={r} clients={clients} />
      ))}
      <datalist id="hs-clients">
        {clients.map((c) => (
          <option key={c.name} value={c.name} />
        ))}
      </datalist>
    </div>
  );
}

function HoursRow({ row, clients }: { row: Row; clients: ClientOpt[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(row.date);
  const [client, setClient] = useState(row.client);
  const [hours, setHours] = useState(String(row.hours));
  const [desc, setDesc] = useState(row.description);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const inc = clients.find((c) => c.name === client)?.increment;

  function reset() {
    setDate(row.date);
    setClient(row.client);
    setHours(String(row.hours));
    setDesc(row.description);
    setConfirmDelete(false);
  }

  function save() {
    const key = { date: row.date, client: row.client, description: row.description };
    start(async () => {
      const r = await saveTimeEdit(key, { date, client: client.trim(), hours: Number(hours), description: desc });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function remove() {
    const key = { date: row.date, client: row.client, description: row.description };
    start(async () => {
      const r = await deleteTimeEntry(key);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="hs-row">
      <div className="hs-row-top">
        <span className="hs-client">{row.client}</span>
        {row.type === "Non-billable" && <span className="hs-tag">NB</span>}
        {row.entered && <span className="hs-tag hs-entered">ENTERED</span>}
        <span className="hs-hours-ro">{formatHours(row.hours)}</span>
        {!editing && (
          <button
            type="button"
            className="tc-link"
            onClick={() => {
              reset();
              setMsg(null);
              setEditing(true);
            }}
          >
            Edit
          </button>
        )}
      </div>
      {!editing && <div className="hs-desc-ro">{row.description}</div>}
      {row.flag && <div className="tc-flag">Sheet check: {row.flag}</div>}

      {editing && (
        <div className="hs-edit">
          {row.entered && (
            <div className="tc-question">
              This row is ticked Entered. If you change it, Lara will need to correct the firm system too.
            </div>
          )}
          <div className="tc-grid">
            <label>
              <span>Matter</span>
              <input list="hs-clients" value={client} onChange={(e) => setClient(e.target.value)} />
            </label>
            <label>
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              <span>Hours{inc ? ` (${inc === 0.25 ? "quarters" : "tenths"})` : ""}</span>
              <input type="number" min="0" step={inc ?? 0.05} value={hours} onChange={(e) => setHours(e.target.value)} />
            </label>
          </div>
          <label className="tc-desc">
            <span>Description (goes on the bill)</span>
            <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </label>
          {(date !== row.date || client.trim() !== row.client) && (
            <div className="tc-note" style={{ marginLeft: 0 }}>
              A new date or matter logs this as a fresh entry (the sheet places it, merging with a same-day row for that
              matter if there is one) and clears the old row.
            </div>
          )}
          <div className="tc-actions">
            {confirmDelete ? (
              <>
                <span className="tc-preview">Remove this entry from the sheet?</span>
                <button type="button" className="tc-secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  Keep
                </button>
                <button type="button" className="tc-danger" onClick={remove} disabled={busy}>
                  {busy ? "Removing…" : "Remove"}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="tc-link hs-remove" onClick={() => setConfirmDelete(true)} disabled={busy}>
                  Remove
                </button>
                <span className="tc-preview" />
                <button type="button" className="tc-secondary" onClick={() => setEditing(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="button" className="tc-primary" onClick={save} disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {msg && (
        <div className={msg.ok ? "tc-note" : "tc-error"} style={{ marginLeft: 0 }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
