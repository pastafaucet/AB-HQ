// ============================================================
// Sidebar information architecture — matches the exemplar exactly.
// Daily surfaces are live pages; every other hub routes to the
// shared placeholder (/hub/[slug]) in V1.
// ============================================================

export type NavItem = {
  href: string;
  label: string;
  code: string; // 2-char monogram for the collapsed rail
  dot: string; // css color
  badge?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

const BLUE = "#5b8cff";
const BLUE2 = "#6f9cff";
const VIOLET = "#8b7cf0";
const GRAY = "#8a93a3";
const TEAL = "#3fb6a8";
const TERRA = "#d88a6a";
const CYAN = "#46b3d6";
const GOLD = "#d8a657";

export const NAV: NavGroup[] = [
  {
    label: "HOME",
    items: [{ href: "/", label: "Andy's HQ", code: "HQ", dot: BLUE }],
  },
  {
    label: "DAILY",
    items: [
      { href: "/start-up", label: "Start of Day", code: "AM", dot: BLUE },
      { href: "/my-day", label: "Today", code: "TD", dot: BLUE },
      { href: "/wind-down", label: "Wind Down", code: "PM", dot: VIOLET },
    ],
  },
  {
    label: "ACTION",
    items: [
      { href: "/hub/inbox", label: "Quick Drop / Inbox", code: "QD", dot: BLUE2, badge: "7" },
      { href: "/hub/tasks", label: "Tasks", code: "TK", dot: BLUE2 },
      { href: "/hub/projects", label: "Projects", code: "PJ", dot: BLUE2, badge: "6" },
      { href: "/hub/cases", label: "Cases", code: "CS", dot: BLUE },
    ],
  },
  {
    label: "PLANNING",
    items: [
      { href: "/hub/goals", label: "Goals", code: "GL", dot: BLUE2, badge: "4" },
      { href: "/hub/calendar", label: "Calendar", code: "CL", dot: BLUE2, badge: "3" },
    ],
  },
  {
    label: "REVIEWS",
    items: [
      { href: "/hub/weekly", label: "Weekly", code: "WK", dot: BLUE2, badge: "4" },
      { href: "/hub/monthly", label: "Monthly", code: "MO", dot: BLUE2 },
    ],
  },
  {
    label: "KNOWLEDGE",
    items: [
      { href: "/hub/knowledge", label: "Knowledge hub", code: "KN", dot: GRAY },
      { href: "/hub/notes", label: "Notes", code: "NT", dot: GRAY },
      { href: "/hub/people", label: "People", code: "PE", dot: GRAY },
      { href: "/hub/tags", label: "Tag list", code: "TG", dot: GRAY },
    ],
  },
  {
    label: "TRACK",
    items: [
      { href: "/hub/time", label: "Time", code: "TM", dot: TEAL },
      { href: "/hub/habits", label: "Habits", code: "HB", dot: TEAL, badge: "5/8" },
      { href: "/hub/journal", label: "Journal", code: "JR", dot: TEAL },
    ],
  },
  {
    label: "HEALTH",
    items: [{ href: "/hub/health", label: "Health", code: "HL", dot: TERRA }],
  },
  {
    label: "FUN",
    items: [
      { href: "/hub/scuba", label: "Scuba", code: "SC", dot: CYAN },
      { href: "/hub/3d", label: "3D Printing", code: "3D", dot: VIOLET, badge: "2" },
      { href: "/hub/games", label: "Games", code: "GM", dot: GOLD },
    ],
  },
];

export function findNavItem(href: string): NavItem | undefined {
  for (const g of NAV) {
    const hit = g.items.find((i) => i.href === href);
    if (hit) return hit;
  }
  return undefined;
}

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
