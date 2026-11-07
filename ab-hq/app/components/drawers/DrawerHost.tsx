"use client";

import { useEffect, useState } from "react";
import {
  loadCaseDrawer,
  loadNoteDrawer,
  loadPersonDrawer,
  loadProjectDrawer,
  loadTaskDrawer,
} from "@/app/(app)/drawer-actions";
import { onOpenDrawer, useEscapeClose, type DrawerKind } from "./bus";
import TaskDrawerContainer from "./TaskDrawerContainer";
import CaseDrawerContainer from "./CaseDrawerContainer";
import ProjectDrawerContainer from "./ProjectDrawerContainer";
import PersonDrawerContainer from "./PersonDrawerContainer";
import NoteDrawerContainer from "./NoteDrawerContainer";

type Loaded =
  | { kind: "task"; data: Awaited<ReturnType<typeof loadTaskDrawer>> }
  | { kind: "case"; data: Awaited<ReturnType<typeof loadCaseDrawer>> }
  | { kind: "project"; data: Awaited<ReturnType<typeof loadProjectDrawer>> }
  | { kind: "person"; data: Awaited<ReturnType<typeof loadPersonDrawer>> }
  | { kind: "note"; data: Awaited<ReturnType<typeof loadNoteDrawer>> };

interface Entry {
  kind: DrawerKind;
  id: string;
  key: number;
  loaded: Loaded | null;
  failed?: boolean;
}

async function load(kind: DrawerKind, id: string): Promise<Loaded> {
  switch (kind) {
    case "task":
      return { kind, data: await loadTaskDrawer(id) };
    case "case":
      return { kind, data: await loadCaseDrawer(id) };
    case "project":
      return { kind, data: await loadProjectDrawer(id) };
    case "person":
      return { kind, data: await loadPersonDrawer(id) };
    case "note":
      return { kind, data: await loadNoteDrawer(id) };
  }
}

let seq = 0;

/**
 * The shell's drawer host. openDrawer(kind, id) from anywhere opens that item
 * over the current page. Drawers stack: opening a case from a task drawer
 * puts the case on top, and closing it returns to the task.
 */
export default function DrawerHost() {
  const [stack, setStack] = useState<Entry[]>([]);

  useEffect(
    () =>
      onOpenDrawer(({ kind, id }) => {
        const key = ++seq;
        setStack((prev) => {
          const top = prev[prev.length - 1];
          if (top && top.kind === kind && top.id === id) return prev;
          return [...prev, { kind, id, key, loaded: null }];
        });
        load(kind, id)
          .then((loaded) =>
            setStack((prev) => prev.map((e) => (e.key === key ? { ...e, loaded } : e)))
          )
          .catch(() =>
            setStack((prev) => prev.map((e) => (e.key === key ? { ...e, failed: true } : e)))
          );
      }),
    []
  );

  const pop = () => setStack((prev) => prev.slice(0, -1));

  if (stack.length === 0) return null;
  // Every open drawer stays mounted (so going back shows its current state,
  // unsaved edits included); only the top one is visible.
  return (
    <div className="drawer-host">
      {stack.map((e, i) => (
        <div key={e.key} style={{ display: i === stack.length - 1 ? "contents" : "none" }}>
          {e.loaded ? (
            <Loaded loaded={e.loaded} onClose={pop} />
          ) : (
            <Pending failed={!!e.failed} onClose={pop} />
          )}
        </div>
      ))}
    </div>
  );
}

function Loaded({ loaded, onClose }: { loaded: Loaded; onClose: () => void }) {
  switch (loaded.kind) {
    case "task": {
      const d = loaded.data;
      return d.task ? (
        <TaskDrawerContainer
          task={d.task}
          matters={d.matters}
          projects={d.projects}
          mitCount={d.mitCount}
          running={d.running}
          onClose={onClose}
        />
      ) : (
        <Pending failed onClose={onClose} />
      );
    }
    case "case":
      return loaded.data.matter ? (
        <CaseDrawerContainer matter={loaded.data.matter} onClose={onClose} />
      ) : (
        <Pending failed onClose={onClose} />
      );
    case "project":
      return loaded.data.project ? (
        <ProjectDrawerContainer
          project={loaded.data.project}
          matters={loaded.data.matters}
          today={loaded.data.today}
          onClose={onClose}
        />
      ) : (
        <Pending failed onClose={onClose} />
      );
    case "person":
      return loaded.data.person ? (
        <PersonDrawerContainer
          person={loaded.data.person}
          matters={loaded.data.matters}
          onClose={onClose}
        />
      ) : (
        <Pending failed onClose={onClose} />
      );
    case "note": {
      const { note, ...rest } = loaded.data;
      return note ? (
        <NoteDrawerContainer data={{ ...rest, note }} onClose={onClose} />
      ) : (
        <Pending failed onClose={onClose} />
      );
    }
  }
}

function Pending({ failed, onClose }: { failed: boolean; onClose: () => void }) {
  useEscapeClose(onClose);
  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="drawer-title-label">{failed ? "NOT FOUND" : "LOADING…"}</span>
          <span className="head-spacer" />
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {failed && <div className="empty-note">That item couldn&rsquo;t be loaded. It may have been deleted.</div>}
      </div>
    </div>
  );
}
