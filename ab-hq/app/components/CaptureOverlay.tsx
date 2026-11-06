"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { captureEntry, type CaptureResult } from "@/app/(app)/entry-actions";
import { parseQuickAdd } from "@/lib/quick-parse";
import { splitBillingLine } from "@/lib/entry-map";
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
                every tuesday &nbsp;·&nbsp; emails with CoCo re same (.2) = logs time
                &nbsp;·&nbsp; 2-3:30pm &nbsp;·&nbsp; case names auto-file
              </div>
            )}
            {(() => {
              if (!text.trim()) return null;
              const segs = splitBillingLine(text.trim());
              if (segs.length > 1) {
                const total = segs.reduce((a, s) => a + (s.tenths ?? 0), 0);
                return (
                  <div className="quick-parse-hint">
                    ↳ billing line · {segs.length} activities · {(total / 10).toFixed(1)}h
                  </div>
                );
              }
              const p = parseQuickAdd(text.trim(), localTodayISO());
              return (
                <div className="quick-parse-hint">
                  ↳ {p.title || "…"}
                  {segs[0].tenths && (
                    <span className="qp-chip" style={{ color: "var(--teal)" }}>
                      {" "}
                      · logs .{segs[0].tenths}
                    </span>
                  )}
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
                  {p.durationLabel && !segs[0].tenths && (
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
