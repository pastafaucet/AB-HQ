"use client";

import { useState, useTransition } from "react";
import type { PersonRow, MatterOption } from "@/lib/queries";
import { createPerson } from "@/app/(app)/people-actions";
import PersonDrawerContainer from "./drawers/PersonDrawerContainer";
import { applyChange, useDrawerChanges } from "./drawers/bus";

type SortKey = "name" | "cases";

export default function PeopleClient({
  people: initialPeople,
  matters,
}: {
  people: PersonRow[];
  matters: MatterOption[];
}) {
  const [people, setPeople] = useState<PersonRow[]>(initialPeople);
  const [q, setQ] = useState("");
  const [fRole, setFRole] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [quickName, setQuickName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  const openPerson = people.find((p) => p.id === openId) ?? null;

  // Edits made in any person drawer (this page's or the shell's) land here.
  useDrawerChanges<PersonRow>("person", (d) => setPeople((prev) => applyChange(prev, d)));

  function submitQuick() {
    const name = quickName.trim();
    if (!name) return;
    setQuickName("");
    startTransition(async () => {
      const r = await createPerson(name);
      if (r.ok && r.id) {
        const created: PersonRow = {
          id: r.id,
          name,
          org: null,
          email: null,
          phone: null,
          notes: null,
          links: [],
        };
        setPeople((prev) => [created, ...prev]);
        setOpenId(r.id);
      } else flash(r.error ?? "Couldn't create person.");
    });
  }

  const allRoles = [...new Set(people.flatMap((p) => p.links.map((l) => l.role)))].sort();
  const needle = q.trim().toLowerCase();
  const shown = people
    .filter((p) => !fRole || p.links.some((l) => l.role === fRole))
    .filter(
      (p) =>
        !needle ||
        p.name.toLowerCase().includes(needle) ||
        (p.org ?? "").toLowerCase().includes(needle) ||
        p.links.some((l) => l.matterName.toLowerCase().includes(needle))
    )
    .sort((a, b) => {
      if (sort === "cases") return b.links.length - a.links.length || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">KNOWLEDGE</div>
            <h1 className="display-h1">People</h1>
          </div>
          <div className="day-head-summary">{people.length} PEOPLE</div>
        </div>

        <div className="capture-row">
          <input
            className="quick-add"
            placeholder="+  Add a person…"
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitQuick();
            }}
          />
          <button className="btn-add" type="button" onClick={submitQuick}>
            + Person
          </button>
        </div>

        <div className="filter-bar">
          <input
            className="filter-input case-search"
            placeholder="Search people, firms, cases…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="dw-select" value={fRole} onChange={(e) => setFRole(e.target.value)}>
            <option value="">Any role</option>
            {allRoles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            className="dw-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="name">By name</option>
            <option value="cases">By case count</option>
          </select>
        </div>

        <div className="case-grid">
          {shown.map((p) => {
            const active = p.links.filter((l) => !l.closed).length;
            const closed = p.links.length - active;
            const roles = [...new Set(p.links.map((l) => l.role))];
            return (
              <div
                key={p.id}
                className="case-card clickable"
                onClick={() => setOpenId(p.id)}
                title="Edit person"
              >
                <div className="case-name person-card-name">{p.name}</div>
                <div className="case-sub">
                  {p.org && <span>{p.org.toUpperCase()}</span>}
                  {roles.length > 0 && (
                    <span className="case-stage">{roles.join(" · ").toUpperCase()}</span>
                  )}
                </div>
                <div className="case-card-mid">
                  <span className="case-count">
                    {p.links.length === 0
                      ? "NO CASES"
                      : `${active} ACTIVE${closed ? ` · ${closed} CLOSED` : ""}`}
                  </span>
                </div>
                <div className="case-card-foot">
                  <span className="case-num">{p.email ?? p.phone ?? "—"}</span>
                </div>
              </div>
            );
          })}
        </div>
        {shown.length === 0 && (
          <div className="empty-note">
            {needle || fRole ? "No one matches." : "No people yet — add counsel, judges, experts…"}
          </div>
        )}
      </section>

      {openPerson && (
        <PersonDrawerContainer
          key={openPerson.id}
          person={openPerson}
          matters={matters}
          onClose={() => setOpenId(null)}
        />
      )}

      {error && <div className="toast">{error}</div>}
    </>
  );
}
