"use client";

import Link from "next/link";
import { TODAY_MODES, rememberTodayMode, type TodayMode } from "@/lib/today-mode";

/** The Start of Day / Today / Wind Down switch at the top of Plan → Today. */
export default function TodayModeSwitch({ mode }: { mode: TodayMode }) {
  return (
    <div className="mode-switch">
      <div className="segmented">
        {TODAY_MODES.map((m) => (
          <Link
            key={m.key}
            href={`/plan/today?mode=${m.key}`}
            className="seg"
            data-active={m.key === mode}
            onClick={() => rememberTodayMode(m.key)}
          >
            {m.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
