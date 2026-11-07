"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { NoteDoc, NotesPageData } from "@/lib/queries";
import {
  updateNote,
  deleteNote,
  addNoteLink,
  removeNoteLink,
  addTagToNote,
  removeTagFromNote,
  type NotePatch,
  type NoteTargetType,
} from "@/app/(app)/note-actions";
import NoteEditor from "../NoteEditor";
import { emitChange, useEscapeClose } from "./bus";

/** One note in a side drawer, with the full editor (drawer host). */
export default function NoteDrawerContainer({
  data,
  onClose,
}: {
  data: Omit<NotesPageData, "notes"> & { note: NoteDoc };
  onClose: () => void;
}) {
  const [note, setNote] = useState<NoteDoc>(data.note);
  const noteRef = useRef(note);
  useEffect(() => {
    noteRef.current = note;
  });
  const [tags, setTags] = useState(data.allTags);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  function commit(next: NoteDoc) {
    noteRef.current = next;
    setNote(next);
    emitChange({ kind: "note", id: next.id, row: next });
  }

  function save() {
    saveTimer.current = null;
    const n = noteRef.current;
    startTransition(async () => {
      const r = await updateNote(n.id, {
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
  }

  function onPatch(patch: NotePatch) {
    const n = noteRef.current;
    commit({
      ...n,
      title: patch.title !== undefined ? patch.title : n.title,
      bodyJson: patch.bodyJson !== undefined ? patch.bodyJson : n.bodyJson,
      bodyText: patch.bodyText !== undefined ? patch.bodyText : n.bodyText,
      pinned: patch.pinned !== undefined ? patch.pinned : n.pinned,
      status: patch.status !== undefined ? patch.status : n.status,
      updatedAt: new Date().toISOString(),
    });
    if (patch.status !== undefined) {
      startTransition(async () => void (await updateNote(n.id, { status: patch.status })));
      return;
    }
    setSaving(true);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 600);
  }

  function close() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      save();
    }
    onClose();
  }
  useEscapeClose(close);

  function onDelete() {
    const id = noteRef.current.id;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    emitChange({ kind: "note", id, deleted: true });
    onClose();
    startTransition(async () => {
      await deleteNote(id);
    });
  }

  function onAddLink(type: NoteTargetType, targetId: string) {
    const n = noteRef.current;
    if (n.links.some((l) => l.type === type && l.id === targetId)) return;
    startTransition(async () => {
      const r = await addNoteLink(n.id, type, targetId);
      if (r.ok && r.linkId) {
        const label =
          type === "matter"
            ? data.matters.find((m) => m.id === targetId)?.name ?? "—"
            : type === "person"
              ? data.people.find((p) => p.id === targetId)?.name ?? "—"
              : data.tasks.find((t) => t.id === targetId)?.title ?? "—";
        const cur = noteRef.current;
        commit({ ...cur, links: [...cur.links, { linkId: r.linkId, type, id: targetId, label }] });
      } else flash(r.error ?? "Couldn't link.");
    });
  }

  function onRemoveLink(linkId: string) {
    const cur = noteRef.current;
    commit({ ...cur, links: cur.links.filter((l) => l.linkId !== linkId) });
    startTransition(async () => {
      const r = await removeNoteLink(linkId);
      if (!r.ok) flash(r.error ?? "Couldn't unlink.");
    });
  }

  function onAddTag(rawName: string) {
    const clean = rawName.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-");
    const n = noteRef.current;
    if (!clean || n.tags.some((t) => t.name === clean)) return;
    startTransition(async () => {
      const r = await addTagToNote(n.id, clean);
      if (r.ok && r.tag) {
        const tag = r.tag;
        const cur = noteRef.current;
        commit({ ...cur, tags: [...cur.tags, tag] });
        setTags((prev) =>
          prev.some((t) => t.id === tag.tagId)
            ? prev
            : [...prev, { id: tag.tagId, name: tag.name, count: 1 }].sort((a, b) =>
                a.name.localeCompare(b.name)
              )
        );
      } else flash(r.error ?? "Couldn't tag.");
    });
  }

  function onRemoveTag(noteTagId: string) {
    const cur = noteRef.current;
    commit({ ...cur, tags: cur.tags.filter((t) => t.noteTagId !== noteTagId) });
    startTransition(async () => {
      const r = await removeTagFromNote(noteTagId);
      if (!r.ok) flash(r.error ?? "Couldn't untag.");
    });
  }

  return (
    <div className="drawer-scrim" onClick={close}>
      <div className="drawer drawer-note" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="drawer-title-label">NOTE</span>
          <span className="drawer-savestate">{saving ? "Saving…" : saved ? "Saved ✓" : ""}</span>
          <span className="head-spacer" />
          <Link className="drawer-label-link" href={`/notes?note=${note.id}`} onClick={close}>
            open in Notes ↗
          </Link>
          <span className="esc-keycap">ESC</span>
          <button className="drawer-close" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        <NoteEditor
          note={note}
          matters={data.matters}
          people={data.people}
          tasks={data.tasks}
          allTags={tags}
          onPatch={onPatch}
          onDelete={onDelete}
          onAddLink={onAddLink}
          onRemoveLink={onRemoveLink}
          onAddTag={onAddTag}
          onRemoveTag={onRemoveTag}
        />
        {error && <div className="toast">{error}</div>}
      </div>
    </div>
  );
}
