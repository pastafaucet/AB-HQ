"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { PersonRow, MatterOption } from "@/lib/queries";
import { listNotesForTarget, createNoteForTarget, type NoteStub } from "@/app/(app)/note-actions";
import {
  updatePerson,
  deletePerson,
  linkPersonToMatter,
  type PersonPatch,
} from "@/app/(app)/people-actions";
import { removePersonFromMatter } from "@/app/(app)/matter-actions";
import PersonDrawer from "../PersonDrawer";
import { emitChange, openDrawer } from "./bus";

function applyPersonPatch(p: PersonRow, patch: PersonPatch): PersonRow {
  const next = { ...p };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.org !== undefined) next.org = patch.org;
  if (patch.email !== undefined) next.email = patch.email;
  if (patch.phone !== undefined) next.phone = patch.phone;
  if (patch.notes !== undefined) next.notes = patch.notes;
  return next;
}

function fullPersonPatch(p: PersonRow): PersonPatch {
  return { name: p.name, org: p.org, email: p.email, phone: p.phone, notes: p.notes };
}

/** A person drawer that owns its own loading and saving (People hub + drawer host). */
export default function PersonDrawerContainer({
  person,
  matters,
  onClose,
}: {
  person: PersonRow;
  matters: MatterOption[];
  onClose: () => void;
}) {
  const [row, setRow] = useState<PersonRow>(person);
  const rowRef = useRef(row);
  useEffect(() => {
    rowRef.current = row;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notes, setNotes] = useState<NoteStub[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await listNotesForTarget("person", person.id);
      if (!live) return;
      setNotesLoading(false);
      if (r.ok) setNotes(r.notes);
    })();
    return () => {
      live = false;
    };
  }, [person.id]);

  function commit(next: PersonRow) {
    rowRef.current = next;
    setRow(next);
    emitChange({ kind: "person", id: next.id, row: next });
  }

  function onField(patch: PersonPatch) {
    commit(applyPersonPatch(rowRef.current, patch));
    setSaving(true);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const p = rowRef.current;
      startTransition(async () => {
        const r = await updatePerson(p.id, fullPersonPatch(p));
        setSaving(false);
        if (r.ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        } else flash(r.error ?? "Couldn't save.");
      });
    }, 450);
  }

  function close() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      const p = rowRef.current;
      startTransition(async () => void (await updatePerson(p.id, fullPersonPatch(p))));
    }
    onClose();
  }

  function onDelete() {
    if (rowRef.current.links.length > 0) {
      flash("Remove them from their cases first.");
      return;
    }
    const id = rowRef.current.id;
    emitChange({ kind: "person", id, deleted: true });
    onClose();
    startTransition(async () => {
      await deletePerson(id);
    });
  }

  function onAddCase(matterId: string, role: string) {
    const id = rowRef.current.id;
    startTransition(async () => {
      const r = await linkPersonToMatter(id, matterId, role);
      if (r.ok && r.linkId) {
        const m = matters.find((x) => x.id === matterId);
        const cur = rowRef.current;
        commit({
          ...cur,
          links: [
            ...cur.links,
            { linkId: r.linkId, matterId, matterName: m?.name ?? "—", role, closed: m?.closed ?? false },
          ],
        });
      } else flash(r.error ?? "Couldn't add case.");
    });
  }

  function onRemoveCase(linkId: string) {
    const cur = rowRef.current;
    commit({ ...cur, links: cur.links.filter((l) => l.linkId !== linkId) });
    startTransition(async () => {
      const r = await removePersonFromMatter(linkId);
      if (!r.ok) flash(r.error ?? "Couldn't remove.");
    });
  }

  function onNewNote() {
    startTransition(async () => {
      const r = await createNoteForTarget("person", person.id);
      if (r.ok && r.id) {
        setNotes((prev) => [{ id: r.id!, title: null, createdAt: new Date().toISOString() }, ...prev]);
        openDrawer("note", r.id);
      } else flash(r.error ?? "Couldn't create note.");
    });
  }

  return (
    <>
      <PersonDrawer
        person={row}
        matters={matters}
        saving={saving}
        saved={saved}
        onField={onField}
        onClose={close}
        onDelete={onDelete}
        onAddCase={onAddCase}
        onRemoveCase={onRemoveCase}
        notes={notes}
        notesLoading={notesLoading}
        onOpenNote={(id) => openDrawer("note", id)}
        onNewNote={onNewNote}
        onOpenCase={(id) => openDrawer("case", id)}
      />
      {error && <div className="toast">{error}</div>}
    </>
  );
}
