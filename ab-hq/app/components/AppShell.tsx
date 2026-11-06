"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DESTINATIONS, activeTab, destHref } from "@/lib/nav";
import { rememberScope, type Scope } from "@/lib/scope";
import { logout } from "@/app/auth-actions";
import CaptureOverlay, { openCapture } from "./CaptureOverlay";
import TabBar from "./TabBar";
import MobileBar from "./MobileBar";

const SCOPES: { key: Scope; label: string }[] = [
  { key: "all", label: "All" },
  { key: "work", label: "Work" },
  { key: "personal", label: "Personal" },
];

export default function AppShell({
  children,
  initialScope,
}: {
  children: React.ReactNode;
  initialScope: Scope;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [scope, setScope] = useState<Scope>(initialScope);
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const current = activeTab(pathname);

  // Live header clock (empty on first render to avoid hydration mismatch).
  const [clock, setClock] = useState("");
  useEffect(() => {
    const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const MO = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const upd = () => {
      const d = new Date();
      setClock(
        `${WD[d.getDay()]} · ${MO[d.getMonth()]} ${d.getDate()} · ${d.getHours()}:${String(
          d.getMinutes()
        ).padStart(2, "0")}`
      );
    };
    upd();
    const t = setInterval(upd, 30000);
    return () => clearInterval(t);
  }, []);

  // The toggle lives in a cookie so server queries filter before render;
  // pages key their screens by scope, so a refresh remounts them fresh.
  function pickScope(s: Scope) {
    if (s === scope) return;
    setScope(s);
    rememberScope(s);
    router.refresh();
  }

  return (
    <div className="shell">
      <aside className="aside" data-collapsed={collapsed}>
        {collapsed ? (
          <>
            <div className="brand-collapsed">
              <div className="brand-mark">H</div>
            </div>
            <div className="capture-wrap is-collapsed">
              <button
                className="capture-square"
                title="Capture (⌘K)"
                type="button"
                onClick={() => openCapture()}
              >
                +
              </button>
            </div>
            <nav className="nav is-collapsed">
              {DESTINATIONS.map((d) => (
                <Link
                  key={d.key}
                  href={destHref(d)}
                  className="nav-tile"
                  data-active={current?.dest.key === d.key}
                  title={d.label}
                  style={{ color: d.dot }}
                >
                  {d.code}
                </Link>
              ))}
            </nav>
            <div className="side-footer is-collapsed">
              <div className="avatar">AB</div>
            </div>
          </>
        ) : (
          <>
            <div className="brand">
              <div className="brand-mark">Andy&rsquo;s HQ</div>
              <div className="brand-kicker">PERSONAL OPERATING SYSTEM</div>
            </div>
            <div className="capture-wrap">
              <button className="capture" type="button" onClick={() => openCapture()}>
                <span className="plus">+</span>
                <span className="grow">Capture</span>
                <span className="keycap">⌘K</span>
              </button>
            </div>
            <nav className="nav">
              {DESTINATIONS.map((d) => (
                <Link
                  key={d.key}
                  href={destHref(d)}
                  className="nav-item nav-dest"
                  data-active={current?.dest.key === d.key}
                >
                  <span className="nav-dot" style={{ background: d.dot }} />
                  <span className="label">{d.label}</span>
                </Link>
              ))}
            </nav>
            <div className="side-footer">
              <div className="avatar">AB</div>
              <div className="who">
                <div className="who-name">Andy Baum</div>
              </div>
              <form action={logout}>
                <button className="gear" type="submit" aria-label="Sign out" title="Sign out">
                  ⏻
                </button>
              </form>
            </div>
          </>
        )}
      </aside>

      <main className="main">
        <header className="header">
          <button
            className="collapse-btn"
            title="Toggle sidebar"
            type="button"
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? "»" : "«"}
          </button>
          <div className="segmented scope-toggle">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                className="seg"
                data-active={scope === s.key}
                type="button"
                onClick={() => pickScope(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button className="searchbar" type="button" onClick={() => openCapture()}>
            <span>⌕</span>
            <span className="grow">Capture a thought…</span>
            <span className="keycap">⌘K</span>
          </button>
          <div className="header-spacer" />
          <div className="header-datetime">{clock}</div>
        </header>

        {current && current.dest.tabs.length > 1 && (
          <TabBar tabs={current.dest.tabs} activeHref={current.tab.href} />
        )}

        <div className="screen-outer">
          <div className="screen-inner">{children}</div>
        </div>
      </main>

      <MobileBar pathname={pathname} />
      <CaptureOverlay />
    </div>
  );
}
