"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { captureEntry, type CaptureResult } from "@/app/(app)/entry-actions";
import { parseQuickAdd } from "@/lib/quick-parse";
import { hasTimeEntry } from "@/lib/time-entry";
import TimeCaptureResults from "./TimeCaptureResults";
import type { TimeCaptureResult } from "@/app/(app)/hours-actions";
import { currentScope, hiddenByScope } from "@/lib/scope";

function localTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// The one box: opened with ⌘K, the sidebar Capture button, or the header
// search bar, from any page. Type, Enter, done — the entry lands in the
// ledger and AI files it. Other components open it by dispatching the
// "abhq:capture" window event (see openCapture below).

export function openCapture(prefill?: string) {
  window.dispatchEvent(new CustomEvent("abhq:capture", { detail: prefill ?? "" }));
}

interface Sent {
  id: number;
  raw: string;
  state: "pending" | "done" | "error";
  label: string; // routing outcome line
  time?: TimeCaptureResult; // a time entry for the hours sheet
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
  const sentRef = useRef<Sent[]>([]);
  useEffect(() => {
    sentRef.current = sent;
  });
  const close = useCallback(() => {
    // Unconfirmed time cards would vanish with the box; check first.
    const waiting = sentRef.current.some((s) => s.time && s.time.pending.length > 0);
    if (waiting && !window.confirm("A time entry is waiting for your confirmation. Close anyway? (It won't be logged.)")) return;
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
    const onOpenEvent = (e: Event) => {
      const prefill = (e as CustomEvent<string>).detail;
      if (prefill) setText(prefill);
      open();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("abhq:capture", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("abhq:capture", onOpenEvent);
    };
  }, [open, close, isOpen]);

  function describe(r: CaptureResult): string {
    if (r.time) {
      const bits: string[] = [];
      if (r.time.logged.length) bits.push(`${r.time.logged.length} logged to the hours sheet`);
      if (r.time.pending.length) bits.push(`${r.time.pending.length} need${r.time.pending.length === 1 ? "s" : ""} you`);
      if (!bits.length) bits.push(r.time.errors[0] ?? "nothing logged");
      return bits.join(" · ");
    }
    if (!r.ok) return r.error ?? "Couldn't save.";
    if (r.label) return r.label;
    const bits: string[] = [];
    if (r.routedTo) bits.push(`filed to ${r.routedTo}`);
    if (r.madeTask) bits.push(`task: “${r.madeTask}”`);
    if (bits.length === 0) bits.push(r.error ?? "saved to Inbox — unfiled");
    const hidden = hiddenByScope(r.madeDomain, currentScope());
    if (hidden) bits.push(hidden);
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
            ? { ...s, state: (r.ok ? "done" : "error") as Sent["state"], label: describe(r), time: r.time }
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
              placeholder="Depo of Dr. Mehta Sept 15 10a-4p Theberge…"
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
            {!text.trim() && (
              <div className="qp-cheat">
                hearing Theberge 10/30 at 9:30 &nbsp;·&nbsp; oppo due friday p1 &nbsp;·&nbsp;
                every tuesday &nbsp;·&nbsp; AB 218 - review memo (.4) = hours sheet
                &nbsp;·&nbsp; 2-3:30pm &nbsp;·&nbsp; case names auto-file
              </div>
            )}
            {(() => {
              if (!text.trim()) return null;
              if (hasTimeEntry(text))
                return (
                  <div className="quick-parse-hint">
                    ↳ time entry → hours sheet
                    <span className="capture-modal-hint">
                      {" "}
                      — matter - task (.4); task (.2) · one entry per line (Shift+Enter) · date first if not today
                    </span>
                  </div>
                );
              const p = parseQuickAdd(text.trim(), localTodayISO());
              return (
                <div className="quick-parse-hint">
                  ↳ {p.title || "…"}
                  {p.type && (
                    <span
                      className="qp-chip"
                      style={{ color: p.type === "Deadline" ? "var(--orange)" : "var(--cyan)" }}
                    >
                      {" "}
                      · {p.type.toUpperCase()}
                    </span>
                  )}
                  {p.dateLabel && <span className="qp-chip"> · {p.dateLabel}</span>}
                  {p.timeLabel && <span className="qp-chip"> · {p.timeLabel}</span>}
                  {p.durationLabel && (
                    <span className="qp-chip"> · {p.durationLabel}</span>
                  )}
                  {p.priority && (
                    <span className="qp-chip" style={{ color: "var(--p" + p.priority + ")" }}>
                      {" "}
                      · P{p.priority}
                    </span>
                  )}
                  {p.recurLabel && (
                    <span className="qp-chip" style={{ color: "var(--teal)" }}>
                      {" "}
                      · ↻ {p.recurLabel}
                    </span>
                  )}
                  {p.domain === "Personal" && (
                    <span className="qp-chip" style={{ color: "var(--violet)" }}>
                      {" "}
                      · PERSONAL
                    </span>
                  )}{" "}
                  <span className="capture-modal-hint">— AI files the case on Enter</span>
                </div>
              );
            })()}
            {sent.length > 0 && (
              <div className="capture-log">
                {sent.map((s) => (
                  <div key={s.id} className={`capture-log-row is-${s.state}`}>
                    <span className="capture-log-raw">{s.raw}</span>
                    <span className="capture-log-result">
                      {s.state === "pending" ? "⋯ routing" : s.label}
                    </span>
                    {s.time && <TimeCaptureResults result={s.time} />}
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
