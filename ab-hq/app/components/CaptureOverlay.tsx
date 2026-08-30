"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { captureEntry, type CaptureResult } from "@/app/(app)/entry-actions";

// The one box: opened with ⌘K, the sidebar Capture button, or the header
// search bar, from any page. Type, Enter, done — the entry lands in the
// ledger and AI files it. Other components open it by dispatching the
// "abhq:capture" window event (see openCapture below).

export function openCapture() {
  window.dispatchEvent(new CustomEvent("abhq:capture"));
}

interface Sent {
  id: number;
  raw: string;
  state: "pending" | "done" | "error";
  label: string; // routing outcome line
}

export default function CaptureOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState("");
  const [sent, setSent] = useState<Sent[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const nextId = useRef(1);

  const open = useCallback(() => {
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    setSent([]);
    setText("");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
      if (e.key === "Escape" && isOpen) close();
    };
    const onOpenEvent = () => open();
    window.addEventListener("keydown", onKey);
    window.addEventListener("abhq:capture", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("abhq:capture", onOpenEvent);
    };
  }, [open, close, isOpen]);

  function describe(r: CaptureResult): string {
    if (!r.ok) return r.error ?? "Couldn't save.";
    if (r.label) return r.label;
    const bits: string[] = [];
    if (r.routedTo) bits.push(`filed to ${r.routedTo}`);
    if (r.madeTask) bits.push(`task: “${r.madeTask}”`);
    if (bits.length === 0) bits.push(r.error ?? "saved to Inbox — unfiled");
    return bits.join(" · ");
  }

  function submit() {
    const raw = text.trim();
    if (!raw) return;
    const id = nextId.current++;
    const pending: Sent = { id, raw, state: "pending", label: "routing…" };
    setSent((prev) => [pending, ...prev].slice(0, 5));
    setText("");
    inputRef.current?.focus();
    (async () => {
      const r = await captureEntry(raw);
      setSent((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, state: (r.ok ? "done" : "error") as Sent["state"], label: describe(r) }
            : s
        )
      );
    })();
  }

  if (!isOpen) return null;
  return (
    <>
      {isOpen && (
        <div className="capture-scrim" onClick={close}>
          <div className="capture-modal" onClick={(e) => e.stopPropagation()}>
            <div className="capture-modal-head">
              <span className="capture-modal-label">CAPTURE</span>
              <span className="capture-modal-hint">
                end with (.2) to log time · paste a whole billing line and it splits · Enter to
                file
              </span>
            </div>
            <textarea
              ref={inputRef}
              className="capture-input"
              placeholder="Judge set MSJ hearing for Oct 30 in Henderson…"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            {sent.length > 0 && (
              <div className="capture-log">
                {sent.map((s) => (
                  <div key={s.id} className={`capture-log-row is-${s.state}`}>
                    <span className="capture-log-raw">{s.raw}</span>
                    <span className="capture-log-result">
                      {s.state === "pending" ? "⋯ routing" : s.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
