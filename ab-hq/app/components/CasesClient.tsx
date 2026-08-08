"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CaseRow } from "@/lib/queries";

const MONTHS_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function fmtDeadline(iso: string, today: string): { label: string; tone: "over" | "today" | "soon" | "far" } {
  const [y, m, d] = iso.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const diff = Math.round(
    (new Date(y, m - 1, d).getTime() - new Date(ty, tm - 1, td).getTime()) / 86400000
  );
  const md = `${MONTHS_SHORT[m - 1]} ${d}${y !== ty ? `, ${y}` : ""}`;
  if (diff < 0) return { label: `${md} · ${-diff}D OVERDUE`, tone: "over" };
  if (diff === 0) return { label: "TODAY", tone: "today" };
  if (diff <= 14) return { label: `${md} · ${diff}D`, tone: "soon" };
  return { label: md, tone: "far" };
}

type SortKey = "deadline" | "name" | "open";

export default function CasesClient({ cases, today }: { cases: CaseRow[]; today: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("deadline");

  const needle = q.trim().toLowerCase();
  const shown = cases
    .filter(
      (c) =>
        !needle ||
        c.name.toLowerCase().includes(needle) ||
        c.client.toLowerCase().includes(needle)
    )
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "open") return b.openCount - a.openCount || a.name.localeCompare(b.name);
      const ad = a.nextDeadline ?? "9999-99-99";
      const bd = b.nextDeadline ?? "9999-99-99";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const noAction = cases.filter((c) => c.openCount === 0).length;

  return (
    <section className="pane">
      <div className="day-head">
        <div>
          <div className="kicker">ACTION</div>
          <h1 className="display-h1">Cases</h1>
        </div>
        <div className="day-head-summary">
          {cases.length} ACTIVE
          {noAction > 0 ? ` · ${noAction} WITHOUT NEXT ACTION` : ""}
        </div>
      </div>

      <div className="filter-bar">
        <input
          className="filter-input case-search"
          placeholder="Search cases or clients…"
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

      {shown.map((c) => {
        const dl = c.nextDeadline ? fmtDeadline(c.nextDeadline, today) : null;
        return (
          <div
            key={c.id}
            className="case-row clickable"
            onClick={() => router.push(`/hub/tasks?matter=${c.id}`)}
            title="View this case's tasks"
          >
            <div className="case-main">
              <div className="case-name">{c.name}</div>
              <div className="case-sub">
                {c.client && <span>{c.client.toUpperCase()}</span>}
                {c.stage && <span className="case-stage">{c.stage.toUpperCase()}</span>}
              </div>
            </div>
            <div className="case-cols">
              {c.openCount === 0 ? (
                <span className="case-noaction">NO NEXT ACTION</span>
              ) : (
                <span className="case-count">
                  {c.openCount} OPEN
                  {c.overdueCount > 0 && (
                    <span className="case-overdue"> · {c.overdueCount} OVERDUE</span>
                  )}
                </span>
              )}
              {dl ? (
                <span className={`case-deadline dl-${dl.tone}`} title={c.deadlineTitle ?? undefined}>
                  {dl.label}
                </span>
              ) : (
                <span className="case-deadline dl-none">NO DEADLINE</span>
              )}
            </div>
          </div>
        );
      })}
      {shown.length === 0 && (
        <div className="empty-note">
          {needle ? "No case matches that search." : "No cases yet."}
        </div>
      )}
    </section>
  );
}
