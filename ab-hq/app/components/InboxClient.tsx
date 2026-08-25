"use client";

import { useState, useTransition } from "react";
import type { Entry, EntryKind, Project } from "@/lib/data";
import type { MatterOption } from "@/lib/queries";
import {
  updateEntry,
  entryToTask,
  deleteEntry,
  type EntryPatch,
} from "@/app/(app)/entry-actions";
import { openCapture } from "./CaptureOverlay";
import ConfirmButton from "./ConfirmButton";

const KINDS: EntryKind[] = ["log", "task", "note", "event"];
const KIND_COLOR: Record<EntryKind, string> = {
  log: "var(--ink-2)",
  task: "var(--accent)",
  note: "var(--violet)",
  event: "var(--cyan)",
};

type Filter = "review" | "all" | "dismissed";

function fmtWhen(iso: string, today: string): string {
  const d = new Date(iso);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (day === today) return time;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${time}`;
}

export default function InboxClient({
  entries: initialEntries,
  matters,
  projects,
  today,
  needsMigration = false,
}: {
  entries: Entry[];
  matters: MatterOption[];
  projects: Project[];
  today: string;
  needsMigration?: boolean;
}) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [filter, setFilter] = useState<Filter>("review");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  function patch(id: string, p: EntryPatch) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              ...(p.kind !== undefined ? { kind: p.kind } : {}),
              ...(p.status !== undefined ? { status: p.status } : {}),
              ...(p.matterId !== undefined ? { matterId: p.matterId ?? undefined } : {}),
              ...(p.projectId !== undefined ? { projectId: p.projectId ?? undefined } : {}),
              routedBy: "manual" as const,
            }
          : e
      )
    );
    startTransition(async () => {
      const r = await updateEntry(id, p);
      if (!r.ok) flash(r.error ?? "Couldn't save.");
    });
  }

  function onMakeTask(id: string) {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, kind: "task", status: "filed" } : e))
    );
    startTransition(async () => {
      const r = await entryToTask(id);
      if (r.ok) flash(`Task created: “${r.taskTitle}”`);
      else flash(r.error ?? "Couldn't create task.");
    });
  }

  function onDelete(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    startTransition(async () => {
      const r = await deleteEntry(id);
      if (!r.ok) flash(r.error ?? "Couldn't delete.");
    });
  }

  const needsReview = entries.filter((e) => e.status === "inbox");
  const shown =
    filter === "review"
      ? needsReview
      : filter === "dismissed"
        ? entries.filter((e) => e.status === "dismissed")
        : entries.filter((e) => e.status !== "dismissed");

  const matterName = (id?: string) => (id ? matters.find((m) => m.id === id)?.name : undefined);
  const projectName = (id?: string) => (id ? projects.find((p) => p.id === id)?.name : undefined);

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">ACTION</div>
            <h1 className="display-h1">Quick Drop</h1>
          </div>
          <div className="day-head-summary">
            {needsReview.length} NEED{needsReview.length === 1 ? "S" : ""} A HOME
            <br />
            {entries.length} IN THE LEDGER
          </div>
        </div>

        {needsMigration && (
          <div className="ontap">
            <div className="ontap-label" style={{ color: "var(--orange)" }}>
              ONE-TIME SETUP NEEDED
            </div>
            <div className="ontap-body">
              The entries table doesn&rsquo;t exist yet. Paste{" "}
              <code>supabase/migrations/0012_entries.sql</code> into the Supabase SQL editor, run
              it, and reload.
            </div>
          </div>
        )}

        <button className="btn-lock capture-cta" type="button" onClick={openCapture}>
          + Capture <span className="lock-load">⌘K from anywhere</span>
        </button>

        <div className="filter-bar">
          <div className="view-pills case-life">
            {(
              [
                ["review", `Needs a home · ${needsReview.length}`],
                ["all", "Ledger"],
                ["dismissed", "Dismissed"],
              ] as [Filter, string][]
            ).map(([f, label]) => (
              <button
                key={f}
                type="button"
                className={`view-pill${filter === f ? " is-active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="entry-list">
          {shown.map((e) => (
            <div key={e.id} className={`entry-row${e.status === "dismissed" ? " is-dismissed" : ""}`}>
              <div className="entry-main">
                <div className="entry-raw">{e.raw}</div>
                {e.summary && e.summary !== e.raw && (
                  <div className="entry-summary">{e.summary}</div>
                )}
                <div className="meta entry-meta">
                  <span className="entry-kind" style={{ color: KIND_COLOR[e.kind] }}>
                    {e.kind.toUpperCase()}
                  </span>
                  {matterName(e.matterId) && (
                    <span className="meta-scope">{matterName(e.matterId)!.toUpperCase()}</span>
                  )}
                  {projectName(e.projectId) && (
                    <span className="meta-project">{projectName(e.projectId)!.toUpperCase()}</span>
                  )}
                  {e.taskId && <span className="kind-task">→ TASK</span>}
                  {e.routedBy === "ai" && <span className="entry-ai" title="Routed by AI">✦ AI</span>}
                  <span className="entry-when">{fmtWhen(e.createdAt, today)}</span>
                </div>
              </div>
              <div className="entry-controls">
                <select
                  className="entry-select"
                  value={e.matterId ?? ""}
                  title="Case"
                  onChange={(ev) =>
                    patch(e.id, {
                      matterId: ev.target.value || null,
                      status: ev.target.value ? "filed" : e.status,
                    })
                  }
                >
                  <option value="">— case —</option>
                  {matters
                    .filter((m) => !m.closed || m.id === e.matterId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
                <select
                  className="entry-select"
                  value={e.kind}
                  title="Kind"
                  onChange={(ev) => patch(e.id, { kind: ev.target.value as EntryKind })}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                {!e.taskId && e.status !== "dismissed" && (
                  <button
                    type="button"
                    className="ov-chip"
                    title="Create a task from this entry"
                    onClick={() => onMakeTask(e.id)}
                  >
                    →TASK
                  </button>
                )}
                {e.status === "inbox" && (
                  <button
                    type="button"
                    className="ov-chip"
                    title="File without a case"
                    onClick={() => patch(e.id, { status: "filed" })}
                  >
                    KEEP
                  </button>
                )}
                {e.status !== "dismissed" ? (
                  <button
                    type="button"
                    className="ov-chip"
                    title="Dismiss — stays in the ledger, out of the way"
                    onClick={() => patch(e.id, { status: "dismissed" })}
                  >
                    ✕
                  </button>
                ) : (
                  <ConfirmButton
                    className="ov-chip"
                    label="DELETE"
                    confirmLabel="SURE?"
                    title="Delete permanently"
                    onConfirm={() => onDelete(e.id)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        {shown.length === 0 && !needsMigration && (
          <div className="empty-note">
            {filter === "review"
              ? "Nothing waiting for a home. Everything you've captured is filed."
              : "Nothing here yet — hit ⌘K and type something."}
          </div>
        )}
      </section>

      {error && <div className="toast">{error}</div>}
    </>
  );
}
