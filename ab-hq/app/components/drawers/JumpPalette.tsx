"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { jumpSearch, type JumpHit, type JumpKind } from "@/app/(app)/drawer-actions";
import { openDrawer, useEscapeClose } from "./bus";

const KIND_LABEL: Record<JumpKind, string> = {
  case: "CASE",
  project: "PROJECT",
  task: "TASK",
  note: "NOTE",
  person: "PERSON",
};

/** Where ⌘Enter goes: the item's home screen. */
function homeHref(h: JumpHit): string {
  switch (h.kind) {
    case "case":
      return `/work/tasks?matter=${h.id}`;
    case "note":
      return `/notes?note=${h.id}`;
    case "project":
      return "/work/projects";
    case "person":
      return "/notes/people";
    case "task":
      return "/work/tasks";
  }
}

export function openJump() {
  window.dispatchEvent(new CustomEvent("abhq:jump"));
}

/** ⌘J: jump to any case, project, task, note or person; it opens in a drawer. */
export default function JumpPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onEvent = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("abhq:jump", onEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("abhq:jump", onEvent);
    };
  }, []);
  return open ? <Palette onClose={() => setOpen(false)} /> : null;
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<JumpHit[]>([]);
  const [sel, setSel] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reqId = useRef(0);
  useEscapeClose(onClose);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function onType(v: string) {
    setQ(v);
    setSel(0);
    const id = ++reqId.current;
    if (v.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Small debounce: wait for a pause in typing before asking the server.
    setTimeout(async () => {
      if (id !== reqId.current) return;
      let r: JumpHit[] = [];
      let failed = false;
      try {
        r = await jumpSearch(v);
      } catch {
        failed = true;
      }
      if (id !== reqId.current) return;
      setHits(r);
      setFailed(failed);
      setLoading(false);
    }, 140);
  }

  function choose(h: JumpHit, goHome: boolean) {
    onClose();
    if (goHome) router.push(homeHref(h));
    else openDrawer(h.kind, h.id);
  }

  return (
    <div className="capture-scrim" onClick={onClose}>
      <div className="capture-modal jump-modal" onClick={(e) => e.stopPropagation()}>
        <div className="capture-modal-head">
          <span className="capture-modal-label">JUMP TO</span>
          <span className="capture-modal-hint">cases · projects · tasks · notes · people · ↵ open · ⌘↵ go to its page</span>
        </div>
        <input
          ref={inputRef}
          className="capture-input jump-input"
          placeholder="Type a name…"
          value={q}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter" && hits[sel]) {
              e.preventDefault();
              choose(hits[sel], e.metaKey || e.ctrlKey);
            }
          }}
        />
        <div className="jump-list">
          {hits.map((h, i) => (
            <button
              key={`${h.kind}:${h.id}`}
              type="button"
              className="jump-row"
              data-sel={i === sel}
              onMouseEnter={() => setSel(i)}
              onClick={(e) => choose(h, e.metaKey || e.ctrlKey)}
            >
              <span className={`jump-kind k-${h.kind}`}>{KIND_LABEL[h.kind]}</span>
              <span className="jump-title">{h.title}</span>
              {h.sub && <span className="jump-sub">{h.sub}</span>}
            </button>
          ))}
          {failed && <div className="jump-empty">Search didn&rsquo;t respond. Try again.</div>}
          {!failed && q.trim().length >= 2 && !loading && hits.length === 0 && (
            <div className="jump-empty">Nothing matches &ldquo;{q.trim()}&rdquo;.</div>
          )}
        </div>
      </div>
    </div>
  );
}
