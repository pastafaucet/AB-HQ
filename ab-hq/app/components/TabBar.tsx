"use client";

import Link from "next/link";
import type { NavTab } from "@/lib/nav";

/** The tab strip under the header: one destination's tabs. */
export default function TabBar({ tabs, activeHref }: { tabs: NavTab[]; activeHref: string }) {
  return (
    <nav className="tabbar" aria-label="Section tabs">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className="tab" data-active={t.href === activeHref}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
