"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Task, Entry, EntryKind, Matter, Project } from "@/lib/data";
import type { MatterOption } from "@/lib/queries";
import { PRIORITY_META, DOMAIN_DOT } from "@/lib/data";
import { applyPatch } from "@/lib/task-patch";
import { updateTask, type TaskPatch } from "@/app/(app)/task-actions";
import { updateEntry, entryToTask, deleteEntry, type EntryPatch } from "@/app/(app)/entry-actions";
import { saveWindDown } from "@/app/(app)/daily-actions";
import { draftNarratives, type NarrativeDraft } from "@/app/(app)/billing-actions";
import ConfirmButton from "./ConfirmButton";

const PRI_COLOR: Record<number, string> = { 1: "#e0665a", 2: "#5fbf8f", 3: "#d8a657", 4: "#6f7787" };
const KINDS: EntryKind[] = ["log", "task", "note", "event"];

function fmtTenthsTotal(t: number): string {
  return `${(t / 10).toFixed(1)}h`;
}

export default function WindDownClient({
  today,
  tomorrow,
  dateLabel,
  doneToday,
  mits: initialMits,
  candidates: initialCandidates,
  inboxEntries: initialInbox,
  capturedToday,
  tenthsToday,
  matters,
  matterOptions,
  projects,
  onTapForTomorrow,
  reflection: initialReflection,
  entriesReady,
}: {
  today: string;
  tomorrow: string;
  dateLabel: string;
  doneToday: Task[];
  mits: Task[];
  candidates: Task[];
  inboxEntries: Entry[];
  capturedToday: number;
  tenthsToday: number;
  matters: Matter[];
  matterOptions: MatterOption[];
  projects: Project[];
  onTapForTomorrow: string | null;
  reflection: string | null;
  entriesReady: boolean;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([...initialMits, ...initialCandidates]);
  const [entries, setEntries] = useState<Entry[]>(initialInbox);
  const [onTap, setOnTap] = useState(onTapForTomorrow ?? "");
  const [reflection, setReflection] = useState(initialReflection ?? "");
  const [drafts, setDrafts] = useState<NarrativeDraft[] | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  function savePatch(id: string, patch: TaskPatch) {
    setTasks((prev) => prev.map((x) => (x.id === id ? applyPatch(x, patch, today) : x)));
    startTransition(async () => {
      const r = await updateTask(id, patch);
      if (!r.ok) flash(r.error ?? "Couldn't save.");
    });
  }

  const mits = tasks.filter((t) => t.mit);
  const unresolved = mits.filter((t) => !t.doDate || t.doDate <= today);
  const rolled = mits.filter((t) => t.doDate === tomorrow);
  const candidates = tasks.filter(
    (t) => !t.mit && ((t.doDate && t.doDate <= tomorrow) || t.priority <= 2)
  );

  function roll(t: Task) {
    savePatch(t.id, { doDate: tomorrow });
  }
  function drop(t: Task) {
    savePatch(t.id, { mit: false });
  }
  function protect(t: Task) {
    if (mits.length >= 3) {
      flash("3 protected already — roll fewer or drop one first.");
      return;
    }
    savePatch(t.id, { mit: true, doDate: tomorrow });
  }

  // --- Quick Drop triage (inline) ---
  function patchEntry(id: string, p: EntryPatch) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              ...(p.kind !== undefined ? { kind: p.kind } : {}),
              ...(p.status !== undefined ? { status: p.status } : {}),
              ...(p.matterId !== undefined ? { matterId: p.matterId ?? undefined } : {}),
              routedBy: "manual" as const,
            }
          : e
      ).filter((e) => e.status === "inbox")
    );
    startTransition(async () => {
      const r = await updateEntry(id, p);
      if (!r.ok) flash(r.error ?? "Couldn't save.");
    });
  }
  function onMakeTask(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    startTransition(async () => {
      const r = await entryToTask(id);
      if (r.ok) flash(`Task created: “${r.taskTitle}”`);
      else flash(r.error ?? "Couldn't create task.");
    });
  }
  function onDeleteEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    startTransition(async () => {
      const r = await deleteEntry(id);
      if (!r.ok) flash(r.error ?? "Couldn't delete.");
    });
  }

  function onDraft() {
    setDrafting(true);
    setDrafts(null);
    startTransition(async () => {
      const r = await draftNarratives(today);
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

  function closeDay() {
    if (closing) return;
    setClosing(true);
    startTransition(async () => {
      const r = await saveWindDown(today, {
        onTapForTomorrow: onTap.trim() || null,
        reflection: reflection.trim() || null,
      });
      setClosing(false);
      if (r.ok) {
        setClosed(true);
        setTimeout(() => router.push("/"), 900);
      } else flash(r.error ?? "Couldn't save.");
    });
  }

  const matterName = (id?: string) => (id ? matters.find((m) => m.id === id)?.name : undefined);
  const projectName = (id?: string) => (id ? projects.find((p) => p.id === id)?.name : undefined);

  function Meta({ t }: { t: Task }) {
    const pm = PRIORITY_META[t.priority];
    const scope = (matterName(t.matterId) ?? t.domain).toUpperCase();
    return (
      <div className="meta">
        <span className={`pri ${pm.cls}`}>{pm.label}</span>
        <span className="cat-dot" style={{ background: DOMAIN_DOT[t.domain] }} />
        <span className="meta-scope">{scope}</span>
        {projectName(t.projectId) && (
          <span className="meta-project">{projectName(t.projectId)!.toUpperCase()}</span>
        )}
        {t.dueTag && <span className="time-tag">{t.dueTag}</span>}
        {t.doDate && t.doDate < today && <span className="overdue-tag">OVERDUE</span>}
      </div>
    );
  }

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">WIND DOWN · {dateLabel.toUpperCase()}</div>
            <h1 className="display-h1">Close the day.</h1>
          </div>
          <div className="day-head-summary">
            {doneToday.length} DONE · {capturedToday} CAPTURED
            {tenthsToday > 0 ? (
              <>
                <br />
                {fmtTenthsTotal(tenthsToday)} ENTERED
              </>
            ) : null}
          </div>
        </div>

        <div className="section-label tight">DONE TODAY · {doneToday.length}</div>
        {doneToday.map((t) => (
          <div key={t.id} className="task-row">
            <span className="check is-done wd-done-check">✓</span>
            <div className="task-body">
              <div className="task-title is-done">{t.title}</div>
              <Meta t={t} />
            </div>
          </div>
        ))}
        {doneToday.length === 0 && (
          <div className="empty-note">Nothing checked off today — it happens.</div>
        )}

        <div className="section-label">
          UNFINISHED MITS · {unresolved.length} — ROLL OR DROP, HONESTLY
        </div>
        {unresolved.map((t) => (
          <div key={t.id} className="mit-row" style={{ borderLeftColor: PRI_COLOR[t.priority] }}>
            <div className="mit-body">
              <div className="mit-title">{t.title}</div>
              <Meta t={t} />
            </div>
            <div className="ov-chips">
              <button type="button" className="ov-chip" onClick={() => roll(t)}>
                ROLL → TMRW
              </button>
              <button
                type="button"
                className="ov-chip"
                title="Unprotect — stays in your lists, loses the slot"
                onClick={() => drop(t)}
              >
                DROP
              </button>
            </div>
          </div>
        ))}
        {unresolved.length === 0 && (
          <div className="empty-note">
            {rolled.length > 0
              ? `All set — ${rolled.length} rolled to tomorrow.`
              : "No unfinished MITs. Clean close."}
          </div>
        )}

        {entriesReady && (
          <>
            <div className="section-label">NEEDS A HOME · {entries.length}</div>
            {entries.map((e) => (
              <div key={e.id} className="entry-row">
                <div className="entry-main">
                  <div className="entry-raw">{e.raw}</div>
                  <div className="meta entry-meta">
                    <span className="entry-kind">{e.kind.toUpperCase()}</span>
                  </div>
                </div>
                <div className="entry-controls">
                  <select
                    className="entry-select"
                    value={e.matterId ?? ""}
                    onChange={(ev) =>
                      patchEntry(e.id, {
                        matterId: ev.target.value || null,
                        status: ev.target.value ? "filed" : e.status,
                      })
                    }
                  >
                    <option value="">— case —</option>
                    {matterOptions
                      .filter((m) => !m.closed)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                  <select
                    className="entry-select"
                    value={e.kind}
                    onChange={(ev) => patchEntry(e.id, { kind: ev.target.value as EntryKind })}
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  {!e.taskId && (
                    <button type="button" className="ov-chip" onClick={() => onMakeTask(e.id)}>
                      →TASK
                    </button>
                  )}
                  <button
                    type="button"
                    className="ov-chip"
                    onClick={() => patchEntry(e.id, { status: "filed" })}
                  >
                    KEEP
                  </button>
                  <ConfirmButton
                    className="ov-chip"
                    label="✕"
                    confirmLabel="SURE?"
                    title="Delete permanently — aggressive delete is a feature"
                    onConfirm={() => onDeleteEntry(e.id)}
                  />
                </div>
              </div>
            ))}
            {entries.length === 0 && (
              <div className="empty-note">Inbox zero. Everything captured has a home.</div>
            )}
          </>
        )}

        <div className="section-label">
          TOMORROW&rsquo;S 3 · {mits.length}/3 PROTECTED
        </div>
        {mits.map((t) => (
          <div key={t.id} className="mit-row" style={{ borderLeftColor: PRI_COLOR[t.priority] }}>
            <div className="mit-num">{mits.indexOf(t) + 1}</div>
            <div className="mit-body">
              <div className="mit-title">{t.title}</div>
              <Meta t={t} />
            </div>
            <button
              type="button"
              className="su-x"
              title="Release this slot"
              onClick={() => drop(t)}
            >
              ×
            </button>
          </div>
        ))}
        {candidates.length > 0 && mits.length < 3 && (
          <>
            <div className="wd-pick-label">PICK FROM:</div>
            {candidates.slice(0, 12).map((t) => (
              <div key={t.id} className="task-row">
                <button
                  type="button"
                  className="row-promote"
                  title="Protect for tomorrow"
                  onClick={() => protect(t)}
                >
                  +
                </button>
                <div className="task-body">
                  <div className="task-title">{t.title}</div>
                  <Meta t={t} />
                </div>
              </div>
            ))}
          </>
        )}

        <div className="section-label">ON TAP FOR TOMORROW</div>
        <textarea
          className="intent-input wd-ontap"
          placeholder="What tomorrow-you should know walking in — Start Up shows this first thing…"
          rows={2}
          value={onTap}
          onChange={(e) => setOnTap(e.target.value)}
        />
        <input
          className="intent-input"
          placeholder="One line on today…  (optional)"
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
        />

        <div className="section-label">BILLING · {fmtTenthsTotal(tenthsToday)} ENTERED TODAY</div>
        {!drafts && (
          <button className="btn-lock wd-draft-btn" type="button" disabled={drafting} onClick={onDraft}>
            {drafting ? "Drafting…" : "Draft today's narratives →"}
            {!drafting && <span className="lock-load">edit · copy · done before you close</span>}
          </button>
        )}
        {drafts &&
          drafts.map((dr) => (
            <div key={dr.matterId ?? "x"} className="narrative-card">
              <div className="narrative-head">
                <span className="narrative-matter">{dr.matterName.toUpperCase()}</span>
                {dr.enteredTenths > 0 && (
                  <span className="narrative-time">{(dr.enteredTenths / 10).toFixed(1)}h</span>
                )}
                <span className="head-spacer" />
                <button
                  type="button"
                  className="ov-chip"
                  onClick={() => {
                    const el = document.getElementById(
                      `wd-narr-${dr.matterId}`
                    ) as HTMLTextAreaElement | null;
                    copy(el?.value ?? dr.narrative, dr.matterId ?? "x");
                  }}
                >
                  {copied === (dr.matterId ?? "x") ? "COPIED ✓" : "COPY"}
                </button>
              </div>
              <textarea
                id={`wd-narr-${dr.matterId}`}
                className="narrative-text"
                defaultValue={dr.narrative}
                rows={3}
              />
            </div>
          ))}

        <button className="btn-lock wd-close" type="button" disabled={closing} onClick={closeDay}>
          {closed ? "Day closed ✓" : closing ? "Closing…" : "Close the day →"}
          {!closed && !closing && (
            <span className="lock-load">
              {mits.length}/3 set for tomorrow{entries.length > 0 ? ` · ${entries.length} unfiled` : ""}
            </span>
          )}
        </button>
      </section>

      {error && <div className="toast">{error}</div>}
    </>
  );
}
