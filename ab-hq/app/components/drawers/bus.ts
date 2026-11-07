"use client";

import { useEffect, useRef } from "react";

// The drawer bus. Any component can open any item in the shell's drawer host
// with openDrawer(kind, id). Drawers announce every change with emitChange;
// list screens subscribe with useDrawerChanges and patch their own state, so
// a drawer opened over a page never leaves that page showing stale data.

export type DrawerKind = "task" | "case" | "project" | "person" | "note";

export interface DrawerChange<T = unknown> {
  kind: DrawerKind;
  id: string;
  row?: T; // the item as it now stands
  deleted?: boolean;
}

const OPEN = "abhq:open-drawer";
const CHANGED = "abhq:changed";

export function openDrawer(kind: DrawerKind, id: string) {
  window.dispatchEvent(new CustomEvent(OPEN, { detail: { kind, id } }));
}

export function onOpenDrawer(fn: (d: { kind: DrawerKind; id: string }) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<{ kind: DrawerKind; id: string }>).detail);
  window.addEventListener(OPEN, h);
  return () => window.removeEventListener(OPEN, h);
}

export function emitChange<T>(d: DrawerChange<T>) {
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: d }));
}

/** Subscribe a list screen to changes of one kind. */
export function useDrawerChanges<T>(kind: DrawerKind, fn: (d: DrawerChange<T>) => void) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<DrawerChange<T>>).detail;
      if (d.kind === kind) ref.current(d);
    };
    window.addEventListener(CHANGED, h);
    return () => window.removeEventListener(CHANGED, h);
  }, [kind]);
}

/** Replace or drop a row in a list after a change. */
export function applyChange<T extends { id: string }>(list: T[], d: DrawerChange<T>): T[] {
  if (d.deleted) return list.filter((x) => x.id !== d.id);
  if (!d.row) return list;
  return list.map((x) => (x.id === d.id ? { ...x, ...d.row } : x));
}

// ---- Esc closes only the topmost drawer ----
// Drawers stack (a host drawer can open over a page's drawer), so each one
// registers here instead of listening to Escape itself; the most recently
// mounted one handles the key.

const escStack: { current: () => void }[] = [];
let escInstalled = false;

function installEsc() {
  if (escInstalled) return;
  escInstalled = true;
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || escStack.length === 0) return;
    // An open @mention picker in a note eats its own Escape.
    if (document.querySelector(".mention-dropdown")) return;
    escStack[escStack.length - 1].current();
  });
}

export function useEscapeClose(fn: () => void) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    installEsc();
    const entry = ref;
    escStack.push(entry);
    return () => {
      const i = escStack.lastIndexOf(entry);
      if (i >= 0) escStack.splice(i, 1);
    };
  }, []);
}
