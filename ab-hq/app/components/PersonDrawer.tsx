"use client";

import { useState } from "react";
import type { PersonRow, MatterOption } from "@/lib/queries";
import type { PersonPatch } from "@/app/(app)/people-actions";
import type { NoteStub } from "@/app/(app)/note-actions";
import { fmtStubDate } from "./CaseDrawer";
import ConfirmButton from "./ConfirmButton";
import { useEscapeClose } from "./drawers/bus";

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

export default function PersonDrawer({
  person,
  matters,
  saving,
  saved,
  onField,
  onClose,
  onDelete,
  onAddCase,
  onRemoveCase,
  notes,
  notesLoading,
  onOpenNote,
  onNewNote,
  onOpenCase,
}: {
  person: PersonRow;
  matters: MatterOption[];
  saving: boolean;
  saved: boolean;
  onField: (patch: PersonPatch) => void;
  onClose: () => void;
  onDelete: () => void;
  onAddCase: (matterId: string, role: string) => void;
  onRemoveCase: (linkId: string) => void;
  notes: NoteStub[];
  notesLoading: boolean;
  onOpenNote: (id: string) => void;
  onNewNote: () => void;
  onOpenCase?: (matterId: string) => void;
}) {
  const [caseId, setCaseId] = useState("");
  const [role, setRole] = useState(ROLES[0]);

  useEscapeClose(onClose);

  function submitCase() {
    if (!caseId) return;
    onAddCase(caseId, role);
    setCaseId("");
  }

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-label="Edit person"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <span className="drawer-title-label">EDIT PERSON</span>
          <span className="drawer-savestate">{saving ? "Saving…" : saved ? "Saved ✓" : ""}</span>
          <span className="head-spacer" />
          <span className="esc-keycap">ESC</span>
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <textarea
          className="drawer-title-input"
          placeholder="Name…"
          value={person.name}
          rows={1}
          onChange={(e) => onField({ name: e.target.value })}
        />

        <div className="drawer-grid">
          <label className="drawer-field">
            <div className="drawer-label">FIRM / ORG</div>
            <input
              type="text"
              className="drawer-select"
              placeholder="—"
              value={person.org ?? ""}
              onChange={(e) => onField({ org: e.target.value || null })}
            />
          </label>
          <label className="drawer-field">
            <div className="drawer-label">EMAIL</div>
            <input
              type="email"
              className="drawer-select"
              placeholder="—"
              value={person.email ?? ""}
              onChange={(e) => onField({ email: e.target.value || null })}
            />
          </label>
        </div>

        <div className="drawer-grid">
          <label className="drawer-field">
            <div className="drawer-label">PHONE</div>
            <input
              type="tel"
              className="drawer-select"
              placeholder="—"
              value={person.phone ?? ""}
              onChange={(e) => onField({ phone: e.target.value || null })}
            />
          </label>
          <div className="drawer-field" />
        </div>

        <label className="drawer-field">
          <div className="drawer-label">NOTES</div>
          <textarea
            className="drawer-select person-notes"
            placeholder="How you know them, quirks, history…"
            rows={3}
            value={person.notes ?? ""}
            onChange={(e) => onField({ notes: e.target.value || null })}
          />
        </label>

        <div className="drawer-field">
          <div className="drawer-label">
            CASES {person.links.length > 0 ? `· ${person.links.length}` : ""}
          </div>
          {person.links.length === 0 && <div className="empty-note">Not on any case yet.</div>}
          {person.links.map((l) => (
            <div key={l.linkId} className="person-row">
              <span className="person-role">{l.role.toUpperCase()}</span>
              {onOpenCase ? (
                <button type="button" className="person-name link-btn" onClick={() => onOpenCase(l.matterId)}>
                  {l.matterName}
                </button>
              ) : (
                <span className="person-name">{l.matterName}</span>
              )}
              {l.closed && <span className="person-org">CLOSED</span>}
              <button
                type="button"
                className="person-remove"
                title="Remove from this case"
                onClick={() => onRemoveCase(l.linkId)}
              >
                ✕
              </button>
            </div>
          ))}

          <div className="person-add">
            <select
              className="drawer-select person-add-name"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
            >
              <option value="">Choose a case…</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.closed ? `${m.name} (closed)` : m.name}
                </option>
              ))}
            </select>
            <select
              className="drawer-select person-add-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button type="button" className="btn-add person-add-btn" onClick={submitCase}>
              Add
            </button>
          </div>
        </div>

        <div className="drawer-field">
          <div className="drawer-label">
            NOTES {notes.length > 0 ? `· ${notes.length}` : ""}
          </div>
          {notesLoading && <div className="empty-note">Loading…</div>}
          {!notesLoading && notes.length === 0 && (
            <div className="empty-note">No notes mention this person yet.</div>
          )}
          {notes.map((n) => (
            <button
              key={n.id}
              type="button"
              className="note-stub"
              onClick={() => onOpenNote(n.id)}
            >
              <span className="note-stub-title">{n.title || "Untitled"}</span>
              <span className="note-stub-date">{fmtStubDate(n.createdAt)}</span>
            </button>
          ))}
          <button type="button" className="btn-add person-add-btn note-stub-new" onClick={onNewNote}>
            + Note
          </button>
        </div>

        <div className="drawer-field">
          <ConfirmButton
            className="person-delete"
            label="Delete person"
            confirmLabel="Delete forever? Click again"
            onConfirm={onDelete}
          />
        </div>
      </div>
    </div>
  );
}
