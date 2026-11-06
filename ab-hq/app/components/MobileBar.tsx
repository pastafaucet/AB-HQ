"use client";

import { useState } from "react";
import Link from "next/link";
import { MOBILE_MORE } from "@/lib/nav";
import { openCapture } from "./CaptureOverlay";

const BAR = [
  { href: "/plan/today", label: "Today", glyph: "☼" },
  { href: "/work/tasks", label: "Tasks", glyph: "☐" },
  { href: "/work/cases", label: "Cases", glyph: "⚖" },
];

function on(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Phone-width navigation: Today, Capture, Tasks, Cases, More. Hidden on desktop. */
export default function MobileBar({ pathname }: { pathname: string }) {
  // The sheet is open only on the page it was opened from, so any
  // navigation closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const moreOpen = openOn === pathname;
  const setMoreOpen = (open: boolean) => setOpenOn(open ? pathname : null);

  const inMore = MOBILE_MORE.some((m) => on(pathname, m.href)) && !BAR.some((b) => on(pathname, b.href));

  return (
    <>
      {moreOpen && (
        <div className="mbar-sheet-wrap" onClick={() => setMoreOpen(false)}>
          <div className="mbar-sheet" onClick={(e) => e.stopPropagation()}>
            {MOBILE_MORE.map((m) => (
              <Link key={m.href} href={m.href} className="mbar-sheet-item" data-active={on(pathname, m.href)}>
                {m.label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav className="mbar" aria-label="Main">
        <Link href={BAR[0].href} className="mbar-item" data-active={on(pathname, BAR[0].href)}>
          <span className="mbar-glyph">{BAR[0].glyph}</span>
          {BAR[0].label}
        </Link>
        <button type="button" className="mbar-item mbar-capture" onClick={() => openCapture()}>
          <span className="mbar-plus">+</span>
          Capture
        </button>
        {BAR.slice(1).map((b) => (
          <Link key={b.href} href={b.href} className="mbar-item" data-active={on(pathname, b.href)}>
            <span className="mbar-glyph">{b.glyph}</span>
            {b.label}
          </Link>
        ))}
        <button
          type="button"
          className="mbar-item"
          data-active={moreOpen || inMore}
          onClick={() => setMoreOpen(!moreOpen)}
        >
          <span className="mbar-glyph">⋯</span>
          More
        </button>
      </nav>
    </>
  );
}
