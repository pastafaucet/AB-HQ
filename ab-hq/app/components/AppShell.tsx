"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, isActive } from "@/lib/nav";
import { logout } from "@/app/auth-actions";
import CaptureOverlay, { openCapture } from "./CaptureOverlay";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname() ?? "/";

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
              {NAV.map((group, gi) => (
                <div className="nav-group" key={group.label}>
                  {gi > 0 && <div className="nav-divider" />}
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="nav-tile"
                        data-active={active}
                        title={item.label}
                        style={{ color: item.dot }}
                      >
                        {item.code}
                        {item.badge && (
                          <span className="nav-badge">{item.badge}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
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
              {NAV.map((group) => (
                <div className="nav-group" key={group.label}>
                  <div className="nav-group-label">{group.label}</div>
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="nav-item"
                        data-active={active}
                      >
                        <span
                          className="nav-dot"
                          style={{ background: item.dot }}
                        />
                        <span className="label">{item.label}</span>
                        {item.badge && (
                          <span className="nav-badge">{item.badge}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
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
          <div className="segmented">
            <button className="seg" data-active={true} type="button">
              All
            </button>
            <button className="seg" type="button">
              Work
            </button>
            <button className="seg" type="button">
              Personal
            </button>
          </div>
          <button className="searchbar" type="button" onClick={() => openCapture()}>
            <span>⌕</span>
            <span className="grow">Capture a thought…</span>
            <span className="keycap">⌘K</span>
          </button>
          <div className="header-spacer" />
          <div className="header-datetime">{clock}</div>
          <div className="header-divider" />
          <div className="status-chip">
            <span className="dot" />
            On track
          </div>
        </header>

        <div className="screen-outer">
          <div className="screen-inner">{children}</div>
        </div>
      </main>

      <CaptureOverlay />
    </div>
  );
}
