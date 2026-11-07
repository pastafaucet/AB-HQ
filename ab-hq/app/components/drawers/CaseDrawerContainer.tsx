"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CaseRow } from "@/lib/queries";
import {
  updateMatter,
  listMatterPeople,
  listAllPeople,
  addPersonToMatter,
  removePersonFromMatter,
  type MatterPatch,
  type MatterPersonRow,
  type PersonOption,
} from "@/app/(app)/matter-actions";
import { listNotesForTarget, createNoteForTarget, type NoteStub } from "@/app/(app)/note-actions";
import CaseDrawer from "../CaseDrawer";
import { emitChange, openDrawer } from "./bus";

function applyMatterPatch(c: CaseRow, p: MatterPatch): CaseRow {
  const next = { ...c };
  if (p.name !== undefined) next.name = p.name;
  if (p.client !== undefined) next.client = p.client ?? "";
  if (p.status !== undefined) next.status = p.status ?? "";
  if (p.caseNumber !== undefined) next.caseNumber = p.caseNumber;
  if (p.court !== undefined) next.court = p.court;
  if (p.nextDeadline !== undefined) next.nextDeadline = p.nextDeadline;
  if (p.disposition !== undefined) next.disposition = p.disposition;
  return next;
}

function fullMatterPatch(c: CaseRow): MatterPatch {
  return {
    name: c.name,
    client: c.client || null,
    status: c.status || null,
    caseNumber: c.caseNumber,
    court: c.court,
    nextDeadline: c.nextDeadline,
    disposition: c.disposition,
  };
}

/**
 * A case drawer that owns its own loading and saving. Used by the Cases hub
 * and by the drawer host; every edit is announced on the drawer bus.
 */
export default function CaseDrawerContainer({
  matter,
  onClose,
}: {
  matter: CaseRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [row, setRow] = useState<CaseRow>(matter);
  const rowRef = useRef(row);
  useEffect(() => {
    rowRef.current = row;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [people, setPeople] = useState<MatterPersonRow[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [allPeople, setAllPeople] = useState<PersonOption[]>([]);
  const [notes, setNotes] = useState<NoteStub[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  useEffect(() => {
    let live = true;
    (async () => {
      const [mine, all, nts] = await Promise.all([
        listMatterPeople(matter.id),
        listAllPeople(),
        listNotesForTarget("matter", matter.id),
      ]);
      if (!live) return;
      setPeopleLoading(false);
      setNotesLoading(false);
      if (mine.ok) setPeople(mine.people);
      if (all.ok) setAllPeople(all.people);
      if (nts.ok) setNotes(nts.notes);
    })();
    return () => {
      live = false;
    };
  }, [matter.id]);

  function onField(patch: MatterPatch) {
    const next = applyMatterPatch(rowRef.current, patch);
    rowRef.current = next;
    setRow(next);
    emitChange({ kind: "case", id: next.id, row: next });
    setSaving(true);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const c = rowRef.current;
      startTransition(async () => {
        const r = await updateMatter(c.id, fullMatterPatch(c));
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
      const c = rowRef.current;
      startTransition(async () => void (await updateMatter(c.id, fullMatterPatch(c))));
    }
    onClose();
  }

  function onAddPerson(name: string, org: string | null, role: string) {
    startTransition(async () => {
      const r = await addPersonToMatter(matter.id, name, org, role);
      if (r.ok && r.person) {
        const p = r.person;
        setPeople((prev) => [...prev, p]);
        setAllPeople((prev) =>
          prev.some((x) => x.id === p.personId)
            ? prev
            : [...prev, { id: p.personId, name: p.name, org: p.org }].sort((a, b) =>
                a.name.localeCompare(b.name)
              )
        );
      } else flash(r.error ?? "Couldn't add person.");
    });
  }

  function onRemovePerson(linkId: string) {
    setPeople((prev) => prev.filter((p) => p.linkId !== linkId));
    startTransition(async () => {
      const r = await removePersonFromMatter(linkId);
      if (!r.ok) flash(r.error ?? "Couldn't remove.");
    });
  }

  function onNewNote() {
    startTransition(async () => {
      const r = await createNoteForTarget("matter", matter.id);
      if (r.ok && r.id) {
        setNotes((prev) => [{ id: r.id!, title: null, createdAt: new Date().toISOString() }, ...prev]);
        openDrawer("note", r.id);
      } else flash(r.error ?? "Couldn't create note.");
    });
  }

  return (
    <>
      <CaseDrawer
        matter={row}
        saving={saving}
        saved={saved}
        onField={onField}
        onClose={close}
        onViewTasks={() => router.push(`/work/tasks?matter=${row.id}`)}
        people={people}
        peopleLoading={peopleLoading}
        allPeople={allPeople}
        onAddPerson={onAddPerson}
        onRemovePerson={onRemovePerson}
        notes={notes}
        notesLoading={notesLoading}
        onOpenNote={(id) => openDrawer("note", id)}
        onNewNote={onNewNote}
        onOpenPerson={(id) => openDrawer("person", id)}
      />
      {error && <div className="toast">{error}</div>}
    </>
  );
}
