"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CaseRow } from "@/lib/queries";
import { createMatter } from "@/app/(app)/matter-actions";
import CaseDrawerContainer from "./drawers/CaseDrawerContainer";
import { applyChange, useDrawerChanges } from "./drawers/bus";

const MONTHS_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function fmtDeadline(
  iso: string,
  today: string
): { label: string; tone: "over" | "today" | "soon" | "far" } {
  const [y, m, d] = iso.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const diff = Math.round(
    (new Date(y, m - 1, d).getTime() - new Date(ty, tm - 1, td).getTime()) / 86400000
  );
  const md = `${MONTHS_SHORT[m - 1]} ${d}${y !== ty ? `, ${y}` : ""}`;
  if (diff < 0) return { label: `${md} · ${-diff}D OVERDUE`, tone: "over" };
  if (diff === 0) return { label: "DEADLINE TODAY", tone: "today" };
  if (diff <= 14) return { label: `${md} · ${diff}D`, tone: "soon" };
  return { label: md, tone: "far" };
}

type SortKey = "deadline" | "name" | "open";
type Lifecycle = "active" | "closed" | "all";

export default function CasesClient({
  cases: initialCases,
  today,
}: {
  cases: CaseRow[];
  today: string;
}) {
  const router = useRouter();
  const [cases, setCases] = useState<CaseRow[]>(initialCases);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("deadline");
  const [life, setLife] = useState<Lifecycle>("active");
  const [quickName, setQuickName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  const openCase = cases.find((c) => c.id === openId) ?? null;

  // Edits made in any case drawer (this page's or the shell's) land here.
  useDrawerChanges<CaseRow>("case", (d) => setCases((prev) => applyChange(prev, d)));

  function submitQuick() {
    const name = quickName.trim();
    if (!name) return;
    setQuickName("");
    startTransition(async () => {
      const r = await createMatter(name);
      if (r.ok && r.id) {
        const created: CaseRow = {
          id: r.id,
          name,
          client: "",
          stage: "",
          status: "Active",
          caseNumber: null,
          court: null,
          disposition: null,
          nextDeadline: null,
          deadlineTitle: null,
          openCount: 0,
          overdueCount: 0,
        };
        setCases((prev) => [created, ...prev]);
        setOpenId(r.id);
      } else flash(r.error ?? "Couldn't create case.");
    });
  }

  const isClosed = (c: CaseRow) => c.status === "Closed" || !!c.disposition;
  const needle = q.trim().toLowerCase();
  const shown = cases
    .filter((c) => (life === "all" ? true : life === "closed" ? isClosed(c) : !isClosed(c)))
    .filter(
      (c) =>
        !needle ||
        c.name.toLowerCase().includes(needle) ||
        c.client.toLowerCase().includes(needle) ||
        (c.caseNumber ?? "").toLowerCase().includes(needle)
    )
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "open") return b.openCount - a.openCount || a.name.localeCompare(b.name);
      const ad = a.nextDeadline ?? "9999-99-99";
      const bd = b.nextDeadline ?? "9999-99-99";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const activeCases = cases.filter((c) => !isClosed(c));
  const noAction = activeCases.filter((c) => c.openCount === 0).length;

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">ACTION</div>
            <h1 className="display-h1">Cases</h1>
          </div>
          <div className="day-head-summary">
            {activeCases.length} ACTIVE
            {noAction > 0 ? ` · ${noAction} WITHOUT NEXT ACTION` : ""}
          </div>
        </div>

        <div className="capture-row">
          <input
            className="quick-add"
            placeholder="+  Add a case…"
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitQuick();
            }}
          />
          <button className="btn-add" type="button" onClick={submitQuick}>
            + Case
          </button>
        </div>

        <div className="filter-bar">
          <div className="view-pills case-life">
            {(["active", "closed", "all"] as Lifecycle[]).map((l) => (
              <button
                key={l}
                type="button"
                className={`view-pill${life === l ? " is-active" : ""}`}
                onClick={() => setLife(l)}
              >
                {l === "active" ? "Active" : l === "closed" ? "Closed" : "All"}
              </button>
            ))}
          </div>
          <input
            className="filter-input case-search"
            placeholder="Search cases, clients, case numbers…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="dw-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="deadline">By next deadline</option>
            <option value="name">By name</option>
            <option value="open">By open tasks</option>
          </select>
        </div>

        <div className="case-grid">
          {shown.map((c) => {
            const dl = c.nextDeadline ? fmtDeadline(c.nextDeadline, today) : null;
            const closed = isClosed(c);
            return (
              <div
                key={c.id}
                className={`case-card clickable${closed ? " is-closed" : ""}`}
                onClick={() => setOpenId(c.id)}
                title="Edit case"
              >
                <div className="case-name">{c.name}</div>
                <div className="case-sub">
                  {c.client && <span>{c.client.toUpperCase()}</span>}
                  {!closed && c.status && <span className="case-stage">{c.status.toUpperCase()}</span>}
                  {closed && (
                    <span className="case-disposition">
                      {(c.disposition ?? "CLOSED").toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="case-card-mid">
                  {closed ? (
                    <span className="case-deadline dl-none">CLOSED</span>
                  ) : dl ? (
                    <span
                      className={`case-deadline dl-${dl.tone}`}
                      title={c.deadlineTitle ?? undefined}
                    >
                      {dl.label}
                    </span>
                  ) : (
                    <span className="case-deadline dl-none">NO DEADLINE</span>
                  )}
                  {!closed &&
                    (c.openCount === 0 ? (
                      <span className="case-noaction">NO NEXT ACTION</span>
                    ) : (
                      <span className="case-count">
                        {c.openCount} OPEN
                        {c.overdueCount > 0 && (
                          <span className="case-overdue"> · {c.overdueCount} OVD</span>
                        )}
                      </span>
                    ))}
                </div>
                <div className="case-card-foot">
                  <span className="case-num">{c.caseNumber ?? "NO CASE NO."}</span>
                  <button
                    type="button"
                    className="case-tasks-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/work/tasks?matter=${c.id}`);
                    }}
                  >
                    TASKS →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {shown.length === 0 && (
          <div className="empty-note">
            {needle ? "No case matches that search." : "Nothing in this bucket."}
          </div>
        )}
      </section>

      {openCase && (
        <CaseDrawerContainer
          key={openCase.id}
          matter={openCase}
          onClose={() => setOpenId(null)}
        />
      )}

      {error && <div className="toast">{error}</div>}
    </>
  );
}
