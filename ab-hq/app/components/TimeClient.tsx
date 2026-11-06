"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DayLedgerData, LedgerGroup } from "@/lib/queries";
import { stripTimeMarkers } from "@/lib/entry-map";
import { draftNarratives, type NarrativeDraft } from "@/app/(app)/billing-actions";

function fmtMin(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function fmtTenths(t: number): string {
  return t < 10 ? `(.${t})` : `(${(t / 10).toFixed(1)})`;
}

// The matter's day as one billing line, assembled deterministically —
// Andy's format: "activity (.4); activity (.2); …". Tracked timer time
// converts to tenths rounded up; unknown times get (.__) to fill in.
function billingLine(g: LedgerGroup): string {
  const parts: string[] = [];
  for (const e of g.entries) {
    const text = stripTimeMarkers(e.summary ?? e.raw).replace(/[.;]\s*$/, "");
    if (!text) continue;
    parts.push(`${text} ${e.billedTenths ? fmtTenths(e.billedTenths) : "(.__)"}`);
  }
  for (const s of g.sessions) {
    const t = Math.max(1, Math.ceil(s.minutes / 6));
    parts.push(`${stripTimeMarkers(s.taskTitle).replace(/[.;]\s*$/, "")} ${fmtTenths(t)}`);
  }
  for (const t of g.doneTasks) {
    parts.push(`${stripTimeMarkers(t).replace(/[.;]\s*$/, "")} (.__)`);
  }
  return parts.join("; ");
}

export default function TimeClient({ data }: { data: DayLedgerData }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<NarrativeDraft[] | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const { date, groups } = data;
  const attributed = groups.filter((g) => g.matterId);
  const unattributed = groups.find((g) => !g.matterId);
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  function shiftDay(delta: number) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + delta);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    router.push(`/work/time?date=${iso}`);
  }

  function onDraft() {
    setDrafting(true);
    setDrafts(null);
    startTransition(async () => {
      const r = await draftNarratives(date);
      setDrafting(false);
      if (r.ok) setDrafts(r.drafts);
      else flash(r.error ?? "Couldn't draft.");
    });
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      flash("Couldn't copy.");
    }
  }

  const hasAnything = groups.length > 0;

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">TRACK</div>
            <h1 className="display-h1">Day ledger</h1>
          </div>
          <div className="day-head-summary">
            {attributed.length} MATTER{attributed.length === 1 ? "" : "S"} TOUCHED
          </div>
        </div>

        <div className="ledger-datebar">
          <button className="ov-chip" type="button" onClick={() => shiftDay(-1)}>
            ← PREV
          </button>
          <span className="ledger-date">{dateLabel}</span>
          <button className="ov-chip" type="button" onClick={() => shiftDay(1)}>
            NEXT →
          </button>
        </div>

        {data.needsMigration && (
          <div className="ontap">
            <div className="ontap-label" style={{ color: "var(--orange)" }}>
              ONE-TIME SETUP NEEDED
            </div>
            <div className="ontap-body">
              Run <code>supabase/migrations/0012_entries.sql</code> in Supabase to activate the
              capture ledger — the day ledger reads from it.
            </div>
          </div>
        )}

        <button
          className="btn-lock"
          type="button"
          disabled={drafting || attributed.length === 0}
          onClick={onDraft}
        >
          {drafting ? "Drafting…" : "Draft billing narratives →"}
          {!drafting && attributed.length > 0 && (
            <span className="lock-load">first draft · you edit</span>
          )}
        </button>

        {drafts && (
          <>
            <div className="section-label">DRAFT NARRATIVES · {drafts.length}</div>
            {drafts.map((d) => (
              <div key={d.matterId ?? "none"} className="narrative-card">
                <div className="narrative-head">
                  <span className="narrative-matter">{d.matterName.toUpperCase()}</span>
                  {d.enteredTenths > 0 && (
                    <span className="narrative-time">
                      {(d.enteredTenths / 10).toFixed(1)}h entered
                    </span>
                  )}
                  {d.totalMinutes > 0 && (
                    <span className="narrative-time">{fmtMin(d.totalMinutes)} tracked</span>
                  )}
                  <span className="head-spacer" />
                  <button
                    type="button"
                    className="ov-chip"
                    onClick={() => {
                      const el = document.getElementById(
                        `narr-${d.matterId}`
                      ) as HTMLTextAreaElement | null;
                      copy(el?.value ?? d.narrative, d.matterId ?? "x");
                    }}
                  >
                    {copied === (d.matterId ?? "x") ? "COPIED ✓" : "COPY"}
                  </button>
                </div>
                <textarea
                  id={`narr-${d.matterId}`}
                  className="narrative-text"
                  defaultValue={d.narrative}
                  rows={3}
                />
              </div>
            ))}
          </>
        )}

        <div className="section-label">THE DAY, BY MATTER</div>
        {attributed.map((g) => (
          <div key={g.matterId} className="ledger-group">
            <div className="ledger-group-head">
              <span className="ledger-matter">{g.matterName}</span>
              {g.client && <span className="ledger-client">{g.client.toUpperCase()}</span>}
              {g.totalTenths > 0 && (
                <span className="narrative-time">
                  {(g.totalTenths / 10).toFixed(1)}h entered
                </span>
              )}
              {g.totalMinutes > 0 && (
                <span className="narrative-time">{fmtMin(g.totalMinutes)} tracked</span>
              )}
              <span className="head-spacer" />
              <button
                type="button"
                className="ov-chip"
                onClick={() => copy(billingLine(g), `line-${g.matterId}`)}
              >
                {copied === `line-${g.matterId}` ? "COPIED ✓" : "COPY LINE"}
              </button>
            </div>
            <div className="billing-line">{billingLine(g)}</div>
            {g.entries.map((e) => (
              <div key={e.id} className="ledger-line">
                <span className="ledger-line-kind" style={{ color: "var(--ink-2)" }}>
                  {e.billedTenths ? fmtTenths(e.billedTenths) : e.kind.toUpperCase()}
                </span>
                <span className="ledger-line-text">
                  {stripTimeMarkers(e.summary ?? e.raw)}
                </span>
              </div>
            ))}
            {g.sessions.map((s, i) => (
              <div key={`s-${i}`} className="ledger-line">
                <span className="ledger-line-kind" style={{ color: "var(--teal)" }}>
                  {fmtMin(s.minutes)}
                </span>
                <span className="ledger-line-text">{s.taskTitle}</span>
              </div>
            ))}
            {g.doneTasks.map((t, i) => (
              <div key={`d-${i}`} className="ledger-line">
                <span className="ledger-line-kind" style={{ color: "var(--green)" }}>
                  DONE
                </span>
                <span className="ledger-line-text">{t}</span>
              </div>
            ))}
          </div>
        ))}
        {unattributed && (
          <div className="ledger-group is-unattributed">
            <div className="ledger-group-head">
              <span className="ledger-matter">Not attributed to a matter</span>
              <button
                type="button"
                className="ov-chip"
                onClick={() => router.push("/work/inbox")}
                title="Assign cases in Quick Drop"
              >
                FIX IN QUICK DROP →
              </button>
            </div>
            {unattributed.entries.map((e) => (
              <div key={e.id} className="ledger-line">
                <span className="ledger-line-kind">{e.kind.toUpperCase()}</span>
                <span className="ledger-line-text">{e.summary ?? e.raw}</span>
              </div>
            ))}
            {unattributed.sessions.map((s, i) => (
              <div key={`s-${i}`} className="ledger-line">
                <span className="ledger-line-kind" style={{ color: "var(--teal)" }}>
                  {fmtMin(s.minutes)}
                </span>
                <span className="ledger-line-text">{s.taskTitle}</span>
              </div>
            ))}
            {unattributed.doneTasks.map((t, i) => (
              <div key={`d-${i}`} className="ledger-line">
                <span className="ledger-line-kind" style={{ color: "var(--green)" }}>
                  DONE
                </span>
                <span className="ledger-line-text">{t}</span>
              </div>
            ))}
          </div>
        )}
        {!hasAnything && !data.needsMigration && (
          <div className="empty-note">
            Nothing captured, tracked, or completed on this day.
          </div>
        )}
      </section>

      {error && <div className="toast">{error}</div>}
    </>
  );
}
