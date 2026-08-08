"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PersonRow, MatterOption } from "@/lib/queries";
import {
  listNotesForTarget,
  createNoteForTarget,
  type NoteStub,
} from "@/app/(app)/note-actions";
import {
  updatePerson,
  createPerson,
  deletePerson,
  linkPersonToMatter,
  type PersonPatch,
} from "@/app/(app)/people-actions";
import { removePersonFromMatter } from "@/app/(app)/matter-actions";
import PersonDrawer from "./PersonDrawer";

type SortKey = "name" | "cases";

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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const router = useRouter();
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- notes mentioning the open person ---
  const [notes, setNotes] = useState<NoteStub[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  useEffect(() => {
    if (!openId) {
      setNotes([]);
      return;
    }
    setNotesLoading(true);
    (async () => {
      const r = await listNotesForTarget("person", openId);
      setNotesLoading(false);
      if (r.ok) setNotes(r.notes);
    })();
  }, [openId]);

  function onNewNote() {
    if (!openId) return;
    const id = openId;
    startTransition(async () => {
      const r = await createNoteForTarget("person", id);
      if (r.ok && r.id) router.push(`/hub/notes?note=${r.id}`);
      else flash(r.error ?? "Couldn't create note.");
    });
  }

  function flash(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  const openPerson = people.find((p) => p.id === openId) ?? null;

  function onField(patch: PersonPatch) {
    if (!openId) return;
    setPeople((prev) => prev.map((p) => (p.id === openId ? applyPersonPatch(p, patch) : p)));
    setSaving(true);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const id = openId;
    saveTimer.current = setTimeout(() => {
      const p = peopleRef.current.find((x) => x.id === id);
      if (!p) return;
      startTransition(async () => {
        const r = await updatePerson(id, fullPersonPatch(p));
        setSaving(false);
        if (r.ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        } else flash(r.error ?? "Couldn't save.");
      });
    }, 450);
  }

  function closeDrawer() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (openId) {
      const p = peopleRef.current.find((x) => x.id === openId);
      if (p) startTransition(async () => void (await updatePerson(p.id, fullPersonPatch(p))));
    }
    setOpenId(null);
    setSaved(false);
  }

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

  function onDelete() {
    if (!openId) return;
    const id = openId;
    const target = people.find((p) => p.id === id);
    if (target && target.links.length > 0) {
      flash("Remove them from their cases first.");
      return;
    }
    setOpenId(null);
    setPeople((prev) => prev.filter((p) => p.id !== id));
    startTransition(async () => {
      const r = await deletePerson(id);
      if (!r.ok) flash(r.error ?? "Couldn't delete.");
    });
  }

  function onAddCase(matterId: string, role: string) {
    if (!openId) return;
    const id = openId;
    startTransition(async () => {
      const r = await linkPersonToMatter(id, matterId, role);
      if (r.ok && r.linkId) {
        const m = matters.find((x) => x.id === matterId);
        setPeople((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  links: [
                    ...p.links,
                    {
                      linkId: r.linkId!,
                      matterId,
                      matterName: m?.name ?? "—",
                      role,
                      closed: m?.closed ?? false,
                    },
                  ],
                }
              : p
          )
        );
      } else flash(r.error ?? "Couldn't add case.");
    });
  }

  function onRemoveCase(linkId: string) {
    if (!openId) return;
    const id = openId;
    setPeople((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, links: p.links.filter((l) => l.linkId !== linkId) } : p
      )
    );
    startTransition(async () => {
      const r = await removePersonFromMatter(linkId);
      if (!r.ok) flash(r.error ?? "Couldn't remove.");
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
        <PersonDrawer
          person={openPerson}
          matters={matters}
          saving={saving}
          saved={saved}
          onField={onField}
          onClose={closeDrawer}
          onDelete={onDelete}
          onAddCase={onAddCase}
          onRemoveCase={onRemoveCase}
          notes={notes}
          notesLoading={notesLoading}
          onOpenNote={(id) => router.push(`/hub/notes?note=${id}`)}
          onNewNote={onNewNote}
        />
      )}

      {error && <div className="toast">{error}</div>}
    </>
  );
}
