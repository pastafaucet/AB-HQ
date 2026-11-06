// ============================================================
// Navigation: five destinations, each one page with tabs.
//   HQ · Plan · Work · Notes · Life
// Tabs that aren't built yet carry `built: false` and stay hidden; a
// destination with no built tabs is hidden entirely (Life, until Goals).
// ============================================================

export type NavTab = {
  href: string;
  label: string;
  built: boolean;
};

export type Destination = {
  key: "hq" | "plan" | "work" | "notes" | "life";
  label: string;
  code: string; // 2-char monogram for the collapsed rail
  dot: string; // css color
  tabs: NavTab[];
};

const BLUE = "#5b8cff";
const BLUE2 = "#6f9cff";
const GRAY = "#8a93a3";
const TEAL = "#3fb6a8";

const ALL_DESTINATIONS: Destination[] = [
  {
    key: "hq",
    label: "HQ",
    code: "HQ",
    dot: BLUE,
    tabs: [{ href: "/", label: "Command Center", built: true }],
  },
  {
    key: "plan",
    label: "Plan",
    code: "PL",
    dot: BLUE,
    tabs: [
      { href: "/plan/today", label: "Today", built: true },
      { href: "/plan/week", label: "Week", built: true },
      { href: "/plan/month", label: "Month", built: false },
      { href: "/plan/year", label: "Year", built: false },
    ],
  },
  {
    key: "work",
    label: "Work",
    code: "WK",
    dot: BLUE2,
    tabs: [
      { href: "/work/inbox", label: "Inbox", built: true },
      { href: "/work/tasks", label: "Tasks", built: true },
      { href: "/work/projects", label: "Projects", built: true },
      { href: "/work/cases", label: "Cases", built: true },
      { href: "/work/time", label: "Time", built: true },
    ],
  },
  {
    key: "notes",
    label: "Notes",
    code: "NT",
    dot: GRAY,
    tabs: [
      { href: "/notes", label: "Notes", built: true },
      { href: "/notes/people", label: "People", built: true },
    ],
  },
  {
    key: "life",
    label: "Life",
    code: "LF",
    dot: TEAL,
    tabs: [
      { href: "/life/goals", label: "Goals", built: false },
      { href: "/life/habits", label: "Habits", built: false },
      { href: "/life/journal", label: "Journal", built: false },
      { href: "/life/health", label: "Health", built: false },
    ],
  },
];

/** Destinations with at least one built tab, showing only built tabs. */
export const DESTINATIONS: Destination[] = ALL_DESTINATIONS.map((d) => ({
  ...d,
  tabs: d.tabs.filter((t) => t.built),
})).filter((d) => d.tabs.length > 0);

function matches(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** The tab for a path: the longest matching href wins (/notes/people over /notes). */
export function activeTab(pathname: string): { dest: Destination; tab: NavTab } | null {
  let best: { dest: Destination; tab: NavTab } | null = null;
  for (const dest of DESTINATIONS) {
    for (const tab of dest.tabs) {
      if (matches(pathname, tab.href) && (!best || tab.href.length > best.tab.href.length)) {
        best = { dest, tab };
      }
    }
  }
  return best;
}

/** Where a destination link goes: its first tab. */
export function destHref(d: Destination) {
  return d.tabs[0].href;
}

/** Mobile "More" sheet: everything not already on the bottom bar. */
export const MOBILE_MORE: { href: string; label: string }[] = [
  { href: "/", label: "HQ" },
  { href: "/plan/week", label: "Week" },
  { href: "/work/inbox", label: "Inbox" },
  { href: "/work/projects", label: "Projects" },
  { href: "/work/time", label: "Time" },
  { href: "/notes", label: "Notes" },
  { href: "/notes/people", label: "People" },
];
