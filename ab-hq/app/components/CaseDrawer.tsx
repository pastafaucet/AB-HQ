"use client";

import { useEffect, useState } from "react";
import type { CaseRow } from "@/lib/queries";
import type { MatterPatch, MatterPersonRow, PersonOption } from "@/app/(app)/matter-actions";

const STATUSES = [
  "Active",
  "Pleadings",
  "Discovery",
  "Motion Practice",
  "Trial",
  "Appeal",
  "Settlement",
  "Probate",
  "On Hold",
  "Closed",
];

const DISPOSITIONS = [
  "Settled",
  "Dismissed",
  "Trial — Verdict",
  "Judgment",
  "Withdrawn",
  "Transferred",
  "Other",
];

const ROLES = [
  "Opposing Counsel",
  "Co-Counsel",
  "Judge",
  "Client Rep",
  "Expert",
  "Mediator",
  "Witness",
  "Paralegal",
  "Other",
];

export default function CaseDrawer({
  matter,
  saving,
  saved,
  onField,
  onClose,
  onViewTasks,
  people,
  peopleLoading,
  allPeople,
  onAddPerson,
  onRemovePerson,
}: {
  matter: CaseRow;
  saving: boolean;
  saved: boolean;
  onField: (patch: MatterPatch) => void;
  onClose: () => void;
  onViewTasks: () => void;
  people: MatterPersonRow[];
  peopleLoading: boolean;
  allPeople: PersonOption[];
  onAddPerson: (name: string, org: string | null, role: string) => void;
  onRemovePerson: (linkId: string) => void;
}) {
  const [pName, setPName] = useState("");
  const [pOrg, setPOrg] = useState("");
  const [pRole, setPRole] = useState(ROLES[0]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Typing a known person's name auto-fills their org.
  function onNameChange(v: string) {
    setPName(v);
    const hit = allPeople.find((p) => p.name.toLowerCase() === v.trim().toLowerCase());
    if (hit) setPOrg(hit.org ?? "");
  }

  function submitPerson() {
    if (!pName.trim()) return;
    onAddPerson(pName, pOrg.trim() || null, pRole);
    setPName("");
    setPOrg("");
  }

  const statusOptions = STATUSES.includes(matter.status) || !matter.status
    ? STATUSES
    : [matter.status, ...STATUSES];
  const isClosed = matter.status === "Closed";

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-label="Edit case"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <span className="drawer-title-label">EDIT CASE</span>
          <span className="drawer-savestate">{saving ? "Saving…" : saved ? "Saved ✓" : ""}</span>
          <span className="head-spacer" />
          <span className="esc-keycap">ESC</span>
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <textarea
          className="drawer-title-input"
          placeholder="Case name…"
          value={matter.name}
          rows={2}
          onChange={(e) => onField({ name: e.target.value })}
        />

        <div className="drawer-grid">
          <label className="drawer-field">
            <div className="drawer-label">CLIENT</div>
            <input
              type="text"
              className="drawer-select"
              placeholder="—"
              value={matter.client}
              onChange={(e) => onField({ client: e.target.value || null })}
            />
          </label>
          <label className="drawer-field">
            <div className="drawer-label">STATUS</div>
            <select
              className="drawer-select"
              value={matter.status || "Active"}
              onChange={(e) => {
                const status = e.target.value;
                onField(status === "Closed" ? { status } : { status, disposition: null });
              }}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isClosed && (
          <div className="drawer-field">
            <div className="drawer-label">DISPOSITION — HOW DID IT END?</div>
            <div className="seg-select disp-wrap">
              {DISPOSITIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`seg-opt${matter.disposition === d ? " is-sel" : ""}`}
                  onClick={() => onField({ disposition: d })}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="drawer-grid">
          <label className="drawer-field">
            <div className="drawer-label">CASE NUMBER</div>
            <input
              type="text"
              className="drawer-select"
              placeholder="—"
              value={matter.caseNumber ?? ""}
              onChange={(e) => onField({ caseNumber: e.target.value || null })}
            />
          </label>
          <label className="drawer-field">
            <div className="drawer-label">COURT</div>
            <input
              type="text"
              className="drawer-select"
              placeholder="—"
              value={matter.court ?? ""}
              onChange={(e) => onField({ court: e.target.value || null })}
            />
          </label>
        </div>

        <div className="drawer-grid">
          <label className="drawer-field">
            <div className="drawer-label">NEXT DEADLINE</div>
            <input
              type="date"
              className="drawer-select"
              value={matter.nextDeadline ?? ""}
              onChange={(e) => onField({ nextDeadline: e.target.value || null })}
            />
          </label>
          <div className="drawer-field">
            <div className="drawer-label">TASKS</div>
            <button type="button" className="drawer-select case-tasks-btn" onClick={onViewTasks}>
              View this case&rsquo;s tasks →
            </button>
          </div>
        </div>

        <div className="drawer-field">
          <div className="drawer-label">
            PEOPLE {people.length > 0 ? `· ${people.length}` : ""}
          </div>
          {peopleLoading && <div className="empty-note">Loading…</div>}
          {!peopleLoading && people.length === 0 && (
            <div className="empty-note">No one attached yet.</div>
          )}
          {people.map((p) => (
            <div key={p.linkId} className="person-row">
              <span className="person-role">{p.role.toUpperCase()}</span>
              <span className="person-name">{p.name}</span>
              {p.org && <span className="person-org">{p.org}</span>}
              <button
                type="button"
                className="person-remove"
                title="Remove from this case"
                onClick={() => onRemovePerson(p.linkId)}
              >
                ✕
              </button>
            </div>
          ))}

          <div className="person-add">
            <input
              type="text"
              className="drawer-select person-add-name"
              placeholder="Name…"
              list="people-options"
              value={pName}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitPerson();
              }}
            />
            <datalist id="people-options">
              {allPeople.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.org ?? ""}
                </option>
              ))}
            </datalist>
            <input
              type="text"
              className="drawer-select person-add-org"
              placeholder="Firm / org…"
              value={pOrg}
              onChange={(e) => setPOrg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitPerson();
              }}
            />
            <select
              className="drawer-select person-add-role"
              value={pRole}
              onChange={(e) => setPRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button type="button" className="btn-add person-add-btn" onClick={submitPerson}>
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
