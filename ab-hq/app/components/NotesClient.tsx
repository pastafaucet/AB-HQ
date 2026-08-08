"use client";

import { useRef, useState, useTransition } from "react";
import type { NoteDoc, NotesPageData } from "@/lib/queries";
import {
  createNote,
  updateNote,
  deleteNote,
  addNoteLink,
  removeNoteLink,
  type NotePatch,
  type NoteTargetType,
} from "@/app/(app)/note-actions";
import NoteEditor from "./NoteEditor";

const MONTHS_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(iso: string): string {
  const now = new Date();
  const todayKey = localDate(now.toISOString());
  const key = localDate(iso);
  if (key === todayKey) return "TODAY";
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === localDate(y.toISOString())) return "YESTERDAY";
  const d = new Date(iso);
  const base = `${DOW[d.getDay()]} · ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

export default function NotesClient({
  initial,
  initialSelectedId,
}: {
  initial: NotesPageData;
  initialSelectedId: string | null;
}) {
  const [notes, setNotes] = useState<NoteDoc[]>(initial.notes);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId && initial.notes.some((n) => n.id === initialSelectedId)
      ? initialSelectedId
      : initial.notes[0]?.id ?? null
  );
  const [q, setQ] = useState("");
  const [fCase, setFCase] = useState("");
  const [fPerson, setFPerson] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const notesRef = useRef(notes);
  notesRef.current = notes;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  function onPatch(patch: NotePatch) {
    if (!selectedId) return;
    const id = selectedId;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id
          ? {
              ...n,
              title: patch.title !== undefined ? patch.title : n.title,
              bodyJson: patch.bodyJson !== undefined ? patch.bodyJson : n.bodyJson,
              bodyText: patch.bodyText !== undefined ? patch.bodyText : n.bodyText,
              pinned: patch.pinned !== undefined ? patch.pinned : n.pinned,
            }
          : n
      )
    );
    setSaving(true);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const n = notesRef.current.find((x) => x.id === id);
      if (!n) return;
      startTransition(async () => {
        const r = await updateNote(id, {
          title: n.title,
          bodyJson: n.bodyJson,
          bodyText: n.bodyText,
          pinned: n.pinned,
        });
        setSaving(false);
        if (r.ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        } else flash(r.error ?? "Couldn't save.");
      });
    }, 600);
  }

  function onNew() {
    startTransition(async () => {
      const r = await createNote();
      if (r.ok && r.id) {
        const fresh: NoteDoc = {
          id: r.id,
          title: null,
          bodyText: "",
          bodyJson: null,
          pinned: false,
          createdAt: r.createdAt ?? new Date().toISOString(),
          updatedAt: r.createdAt ?? new Date().toISOString(),
          links: [],
        };
        setNotes((prev) => [fresh, ...prev]);
        setSelectedId(r.id);
      } else flash(r.error ?? "Couldn't create note.");
    });
  }

  function onDelete() {
    if (!selectedId) return;
    const id = selectedId;
    const rest = notes.filter((n) => n.id !== id);
    setNotes(rest);
    setSelectedId(rest[0]?.id ?? null);
    startTransition(async () => {
      const r = await deleteNote(id);
      if (!r.ok) flash(r.error ?? "Couldn't delete.");
    });
  }

  function onAddLink(type: NoteTargetType, targetId: string) {
    if (!selectedId) return;
    const id = selectedId;
    const note = notesRef.current.find((n) => n.id === id);
    if (note?.links.some((l) => l.type === type && l.id === targetId)) return; // already linked
    startTransition(async () => {
      const r = await addNoteLink(id, type, targetId);
      if (r.ok && r.linkId) {
        const label =
          type === "matter"
            ? initial.matters.find((m) => m.id === targetId)?.name ?? "—"
            : type === "person"
              ? initial.people.find((p) => p.id === targetId)?.name ?? "—"
              : initial.tasks.find((t) => t.id === targetId)?.title ?? "—";
        setNotes((prev) =>
          prev.map((n) =>
            n.id === id
              ? { ...n, links: [...n.links, { linkId: r.linkId!, type, id: targetId, label }] }
              : n
          )
        );
      } else flash(r.error ?? "Couldn't link.");
    });
  }

  function onRemoveLink(linkId: string) {
    if (!selectedId) return;
    const id = selectedId;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, links: n.links.filter((l) => l.linkId !== linkId) } : n
      )
    );
    startTransition(async () => {
      const r = await removeNoteLink(linkId);
      if (!r.ok) flash(r.error ?? "Couldn't unlink.");
    });
  }

  const needle = q.trim().toLowerCase();
  const shown = notes.filter(
    (n) =>
      (!fCase || n.links.some((l) => l.type === "matter" && l.id === fCase)) &&
      (!fPerson || n.links.some((l) => l.type === "person" && l.id === fPerson)) &&
      (!needle ||
        (n.title ?? "").toLowerCase().includes(needle) ||
        n.bodyText.toLowerCase().includes(needle) ||
        n.links.some((l) => l.label.toLowerCase().includes(needle)))
  );
  const pinned = shown.filter((n) => n.pinned);
  const unpinned = shown.filter((n) => !n.pinned);

  // group unpinned by local created date, newest first (list is already ordered)
  const groups: { label: string; items: NoteDoc[] }[] = [];
  for (const n of unpinned) {
    const label = dayLabel(n.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }

  function ListItem({ n }: { n: NoteDoc }) {
    const snippet = n.bodyText.replace(/\s+/g, " ").trim().slice(0, 80);
    return (
      <button
        type="button"
        className={`note-item${n.id === selectedId ? " is-sel" : ""}`}
        onClick={() => setSelectedId(n.id)}
      >
        <div className="note-item-title">
          {n.pinned && <span className="note-item-pin">★ </span>}
          {n.title || "Untitled"}
        </div>
        {snippet && <div className="note-item-snippet">{snippet}</div>}
        {n.links.length > 0 && (
          <div className="note-item-links">
            {n.links.slice(0, 3).map((l) => (
              <span key={l.linkId} className={`note-mini-chip nc-${l.type}`}>
                {l.label}
              </span>
            ))}
            {n.links.length > 3 && <span className="note-mini-chip">+{n.links.length - 3}</span>}
          </div>
        )}
      </button>
    );
  }

  return (
    <>
      <section className="pane notes-pane">
        <div className="notes-list">
          <div className="notes-list-head">
            <span className="kicker">NOTES · {notes.length}</span>
            <span className="drawer-savestate">{saving ? "Saving…" : saved ? "Saved ✓" : ""}</span>
            <button type="button" className="btn-add notes-new" onClick={onNew}>
              + Note
            </button>
          </div>
          <input
            className="filter-input notes-search"
            placeholder="Search notes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="notes-filters">
            <select className="dw-select" value={fCase} onChange={(e) => setFCase(e.target.value)}>
              <option value="">Any case</option>
              {initial.matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.closed ? `${m.name} (closed)` : m.name}
                </option>
              ))}
            </select>
            <select
              className="dw-select"
              value={fPerson}
              onChange={(e) => setFPerson(e.target.value)}
            >
              <option value="">Anyone</option>
              {initial.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="notes-scroll">
            {pinned.length > 0 && (
              <>
                <div className="section-label tight">PINNED</div>
                {pinned.map((n) => (
                  <ListItem key={n.id} n={n} />
                ))}
              </>
            )}
            {groups.map((g) => (
              <div key={g.label}>
                <div className="section-label tight">{g.label}</div>
                {g.items.map((n) => (
                  <ListItem key={n.id} n={n} />
                ))}
              </div>
            ))}
            {shown.length === 0 && (
              <div className="empty-note">
                {needle || fCase || fPerson ? "No note matches." : "No notes yet."}
              </div>
            )}
          </div>
        </div>

        <div className="notes-editor-pane">
          {selected ? (
            <NoteEditor
              key={selected.id}
              note={selected}
              matters={initial.matters}
              people={initial.people}
              tasks={initial.tasks}
              onPatch={onPatch}
              onDelete={onDelete}
              onAddLink={onAddLink}
              onRemoveLink={onRemoveLink}
            />
          ) : (
            <div className="notes-empty-state">
              <div className="placeholder-glyph">NT</div>
              <p className="placeholder-note">Select a note or create one.</p>
            </div>
          )}
        </div>
      </section>

      {error && <div className="toast">{error}</div>}
    </>
  );
}
