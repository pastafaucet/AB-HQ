"use client";

import { useRef, useState, useTransition } from "react";
import type { NoteDoc, NotesPageData } from "@/lib/queries";
import {
  createNote,
  updateNote,
  deleteNote,
  addNoteLink,
  removeNoteLink,
  addTagToNote,
  removeTagFromNote,
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
  const [fTag, setFTag] = useState("");
  const [fStatus, setFStatus] = useState<"all" | "inbox" | "archived">("all");
  const [sort, setSort] = useState<"created" | "updated">("created");
  const [tagList, setTagList] = useState(initial.allTags);
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
              status: patch.status !== undefined ? patch.status : n.status,
              updatedAt: new Date().toISOString(),
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
          status: "Active",
          createdAt: r.createdAt ?? new Date().toISOString(),
          updatedAt: r.createdAt ?? new Date().toISOString(),
          links: [],
          tags: [],
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

  function onAddTag(rawName: string) {
    if (!selectedId) return;
    const id = selectedId;
    const clean = rawName.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-");
    const note = notesRef.current.find((n) => n.id === id);
    if (!clean || note?.tags.some((t) => t.name === clean)) return;
    startTransition(async () => {
      const r = await addTagToNote(id, clean);
      if (r.ok && r.tag) {
        const tag = r.tag;
        setNotes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, tags: [...n.tags, tag] } : n))
        );
        setTagList((prev) => {
          const hit = prev.find((t) => t.id === tag.tagId);
          if (hit)
            return prev.map((t) => (t.id === tag.tagId ? { ...t, count: t.count + 1 } : t));
          return [...prev, { id: tag.tagId, name: tag.name, count: 1 }].sort((a, b) =>
            a.name.localeCompare(b.name)
          );
        });
      } else flash(r.error ?? "Couldn't tag.");
    });
  }

  function onRemoveTag(noteTagId: string) {
    if (!selectedId) return;
    const id = selectedId;
    const removed = notesRef.current
      .find((n) => n.id === id)
      ?.tags.find((t) => t.noteTagId === noteTagId);
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, tags: n.tags.filter((t) => t.noteTagId !== noteTagId) } : n
      )
    );
    if (removed)
      setTagList((prev) =>
        prev.map((t) => (t.id === removed.tagId ? { ...t, count: Math.max(0, t.count - 1) } : t))
      );
    startTransition(async () => {
      const r = await removeTagFromNote(noteTagId);
      if (!r.ok) flash(r.error ?? "Couldn't untag.");
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

  function displayTitle(n: NoteDoc): string {
    return (
      n.title?.trim() ||
      n.bodyText.trim().split("\n")[0]?.slice(0, 60) ||
      "Untitled"
    );
  }

  const needle = q.trim().toLowerCase();
  // Everything except the status pills — so pill counts reflect current filters.
  const base = notes.filter(
    (n) =>
      (!fCase || n.links.some((l) => l.type === "matter" && l.id === fCase)) &&
      (!fPerson || n.links.some((l) => l.type === "person" && l.id === fPerson)) &&
      (!fTag || n.tags.some((t) => t.tagId === fTag)) &&
      (!needle ||
        (n.title ?? "").toLowerCase().includes(needle) ||
        n.bodyText.toLowerCase().includes(needle) ||
        n.links.some((l) => l.label.toLowerCase().includes(needle)) ||
        n.tags.some((t) => t.name.includes(needle)))
  );
  const statusCounts = {
    all: base.filter((n) => n.status !== "Archived").length,
    inbox: base.filter((n) => n.status === "Inbox").length,
    archived: base.filter((n) => n.status === "Archived").length,
  };
  const shown = base
    .filter((n) =>
      fStatus === "archived"
        ? n.status === "Archived"
        : fStatus === "inbox"
          ? n.status === "Inbox"
          : n.status !== "Archived"
    )
    .sort((a, b) =>
      sort === "updated"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : b.createdAt.localeCompare(a.createdAt)
    );
  const pinned = shown.filter((n) => n.pinned);
  const unpinned = shown.filter((n) => !n.pinned);

  // group unpinned by day of the sort field, newest first
  const groups: { label: string; items: NoteDoc[] }[] = [];
  for (const n of unpinned) {
    const label = dayLabel(sort === "updated" ? n.updatedAt : n.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }

  function ListItem({ n }: { n: NoteDoc }) {
    const snippet = n.bodyText.replace(/\s+/g, " ").trim().slice(0, 80);
    return (
      <button
        type="button"
        className={`note-item${n.id === selectedId ? " is-sel" : ""}${n.status === "Archived" ? " is-archived" : ""}`}
        onClick={() => setSelectedId(n.id)}
      >
        <div className="note-item-title">
          {n.pinned && <span className="note-item-pin">★ </span>}
          {n.status === "Inbox" && <span className="note-inbox-badge">INBOX</span>}
          {displayTitle(n)}
        </div>
        {snippet && <div className="note-item-snippet">{snippet}</div>}
        {(n.links.length > 0 || n.tags.length > 0) && (
          <div className="note-item-links">
            {n.links.slice(0, 3).map((l) => (
              <span key={l.linkId} className={`note-mini-chip nc-${l.type}`}>
                {l.label}
              </span>
            ))}
            {n.links.length > 3 && <span className="note-mini-chip">+{n.links.length - 3}</span>}
            {n.tags.slice(0, 3).map((t) => (
              <span key={t.noteTagId} className="note-mini-chip nc-tag">
                #{t.name}
              </span>
            ))}
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
          <div className="notes-status-row">
            {(["all", "inbox", "archived"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`view-pill${fStatus === s ? " is-active" : ""}`}
                onClick={() => setFStatus(s)}
              >
                {s === "all" ? "All" : s === "inbox" ? "Inbox" : "Archived"} · {statusCounts[s]}
              </button>
            ))}
            <select
              className="dw-select notes-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as "created" | "updated")}
              title="Sort order"
            >
              <option value="created">Newest</option>
              <option value="updated">Recently edited</option>
            </select>
          </div>
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
            <select className="dw-select" value={fTag} onChange={(e) => setFTag(e.target.value)}>
              <option value="">Any tag</option>
              {tagList.map((t) => (
                <option key={t.id} value={t.id}>
                  #{t.name} ({t.count})
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
                {needle || fCase || fPerson || fTag ? "No note matches." : "No notes yet."}
              </div>
            )}
          </div>

          <div className="notes-legend">
            <div>
              <span className="lg-key">@</span> link case/person ·{" "}
              <span className="lg-key">#</span> tag topic
            </div>
            <div>
              <span className="lg-key">##␣</span> heading · <span className="lg-key">-␣</span>{" "}
              bullet · <span className="lg-key">1.␣</span> numbered ·{" "}
              <span className="lg-key">&gt;␣</span> quote
            </div>
            <div>
              <span className="lg-key">⌘B</span> bold · <span className="lg-key">⌘I</span> italic ·{" "}
              <span className="lg-key">⌘U</span> underline
            </div>
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
              allTags={tagList}
              onPatch={onPatch}
              onDelete={onDelete}
              onAddLink={onAddLink}
              onRemoveLink={onRemoveLink}
              onAddTag={onAddTag}
              onRemoveTag={onRemoveTag}
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
