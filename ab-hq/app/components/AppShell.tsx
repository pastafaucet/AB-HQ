"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, isActive } from "@/lib/nav";
import { logout } from "@/app/auth-actions";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname() ?? "/";

  return (
    <div className="shell">
      <aside className="aside" data-collapsed={collapsed}>
        {collapsed ? (
          <>
            <div className="brand-collapsed">
              <div className="brand-mark">H</div>
            </div>
            <div className="capture-wrap is-collapsed">
              <button className="capture-square" title="Capture (⌘K)" type="button">
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
              <button className="capture" type="button">
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
          <div className="searchbar">
            <span>⌕</span>
            <span className="grow">Search anything, or capture a thought…</span>
            <span className="keycap">⌘K</span>
          </div>
          <div className="header-spacer" />
          <div className="header-datetime">SAT · JUL 5 · 9:14</div>
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
    </div>
  );
}
