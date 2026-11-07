"use client";

import { useState, useTransition } from "react";
import type { ProjectRow, MatterOption } from "@/lib/queries";
import { createProject } from "@/app/(app)/project-actions";
import ProjectDrawerContainer from "./drawers/ProjectDrawerContainer";
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
  if (diff === 0) return { label: "DUE TODAY", tone: "today" };
  if (diff <= 14) return { label: `${md} · ${diff}D`, tone: "soon" };
  return { label: md, tone: "far" };
}

type SortKey = "deadline" | "name" | "open";
type Lifecycle = "active" | "done" | "archived" | "all";

export default function ProjectsClient({
  projects: initialProjects,
  matters,
  today,
  needsMigration = false,
}: {
  projects: ProjectRow[];
  matters: MatterOption[];
  today: string;
  needsMigration?: boolean;
}) {
  const [projects, setProjects] = useState<ProjectRow[]>(initialProjects);
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

  const openProject = projects.find((p) => p.id === openId) ?? null;

  // Edits made in any project drawer (this page's or the shell's) land here.
  useDrawerChanges<ProjectRow>("project", (d) => setProjects((prev) => applyChange(prev, d)));

  function submitQuick() {
    const name = quickName.trim();
    if (!name) return;
    setQuickName("");
    startTransition(async () => {
      const r = await createProject(name);
      if (r.ok && r.project) {
        const created: ProjectRow = {
          id: r.project.id,
          name,
          matterId: null,
          matterName: null,
          deadline: null,
          status: "Active",
          notes: null,
          openCount: 0,
          overdueCount: 0,
          doneCount: 0,
          totalCount: 0,
          nextDue: null,
          nextDueTitle: null,
        };
        setProjects((prev) => [created, ...prev]);
        setOpenId(created.id);
      } else flash(r.error ?? "Couldn't create project.");
    });
  }

  const needle = q.trim().toLowerCase();
  const shown = projects
    .filter((p) => (life === "all" ? true : p.status.toLowerCase() === life))
    .filter(
      (p) =>
        !needle ||
        p.name.toLowerCase().includes(needle) ||
        (p.matterName ?? "").toLowerCase().includes(needle)
    )
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "open") return b.openCount - a.openCount || a.name.localeCompare(b.name);
      const ad = a.deadline ?? a.nextDue ?? "9999-99-99";
      const bd = b.deadline ?? b.nextDue ?? "9999-99-99";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const active = projects.filter((p) => p.status === "Active");
  const stalled = active.filter((p) => p.openCount === 0).length;

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">ACTION</div>
            <h1 className="display-h1">Projects</h1>
          </div>
          <div className="day-head-summary">
            {active.length} ACTIVE
            {stalled > 0 ? ` · ${stalled} WITHOUT NEXT ACTION` : ""}
          </div>
        </div>

        {needsMigration && (
          <div className="ontap">
            <div className="ontap-label" style={{ color: "var(--orange)" }}>
              ONE-TIME SETUP NEEDED
            </div>
            <div className="ontap-body">
              The projects table doesn&rsquo;t exist in the database yet. Paste{" "}
              <code>supabase/migrations/0011_projects.sql</code> into the Supabase SQL editor,
              run it, and reload this page. Your existing free-text project tags convert
              automatically.
            </div>
          </div>
        )}

        <div className="capture-row">
          <input
            className="quick-add"
            placeholder="+  Add a project…  (e.g. MSJ opposition)"
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitQuick();
            }}
          />
          <button className="btn-add" type="button" onClick={submitQuick}>
            + Project
          </button>
        </div>

        <div className="filter-bar">
          <div className="view-pills case-life">
            {(["active", "done", "archived", "all"] as Lifecycle[]).map((l) => (
              <button
                key={l}
                type="button"
                className={`view-pill${life === l ? " is-active" : ""}`}
                onClick={() => setLife(l)}
              >
                {l[0].toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
          <input
            className="filter-input case-search"
            placeholder="Search projects, cases…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="dw-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="deadline">By deadline</option>
            <option value="name">By name</option>
            <option value="open">By open tasks</option>
          </select>
        </div>

        <div className="case-grid">
          {shown.map((p) => {
            const dlIso = p.deadline ?? p.nextDue;
            const dl = dlIso ? fmtDeadline(dlIso, today) : null;
            const closed = p.status !== "Active";
            const pct = p.totalCount > 0 ? Math.round((p.doneCount / p.totalCount) * 100) : 0;
            return (
              <div
                key={p.id}
                className={`case-card clickable${closed ? " is-closed" : ""}`}
                onClick={() => setOpenId(p.id)}
                title="Edit project"
              >
                <div className="case-name">{p.name}</div>
                <div className="case-sub">
                  {p.matterName && <span>{p.matterName.toUpperCase()}</span>}
                  {closed && (
                    <span className="case-disposition">{p.status.toUpperCase()}</span>
                  )}
                </div>
                <div className="case-card-mid">
                  {closed ? (
                    <span className="case-deadline dl-none">{p.status.toUpperCase()}</span>
                  ) : dl ? (
                    <span
                      className={`case-deadline dl-${dl.tone}`}
                      title={
                        p.deadline
                          ? "Project deadline"
                          : p.nextDueTitle ?? undefined
                      }
                    >
                      {dl.label}
                    </span>
                  ) : (
                    <span className="case-deadline dl-none">NO DEADLINE</span>
                  )}
                  {!closed &&
                    (p.openCount === 0 ? (
                      <span className="case-noaction">NO NEXT ACTION</span>
                    ) : (
                      <span className="case-count">
                        {p.openCount} OPEN
                        {p.overdueCount > 0 && (
                          <span className="case-overdue"> · {p.overdueCount} OVD</span>
                        )}
                      </span>
                    ))}
                </div>
                <div className="case-card-foot proj-foot">
                  <div className="proj-bar">
                    <div className="proj-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="proj-bar-label">
                    {p.totalCount > 0 ? `${p.doneCount}/${p.totalCount}` : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {shown.length === 0 && (
          <div className="empty-note">
            {needle ? "No project matches that search." : "Nothing in this bucket."}
          </div>
        )}
      </section>

      {openProject && (
        <ProjectDrawerContainer
          key={openProject.id}
          project={openProject}
          matters={matters}
          today={today}
          onClose={() => setOpenId(null)}
        />
      )}

      {error && <div className="toast">{error}</div>}
    </>
  );
}
