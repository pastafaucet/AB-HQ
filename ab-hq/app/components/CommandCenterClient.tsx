"use client";

import { useRouter } from "next/navigation";
import type { CommandCenterData } from "@/lib/queries";

const MO = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MO[m - 1]} ${d}`;
}

export default function CommandCenterClient({
  data,
  dateLabel,
}: {
  data: CommandCenterData;
  dateLabel: string;
}) {
  const router = useRouter();
  const greeting =
    data.hour < 12 ? "Good morning." : data.hour < 17 ? "Good afternoon." : "Good evening.";

  const attention: { label: string; n: number; hot: boolean; href: string }[] = [
    { label: "DUE TODAY", n: data.dueToday, hot: false, href: "/my-day" },
    { label: "OVERDUE", n: data.overdue, hot: data.overdue > 0, href: "/start-up" },
    { label: "NEEDS A HOME", n: data.needsHome, hot: false, href: "/hub/inbox" },
    { label: "GONE SILENT", n: data.silent, hot: data.silent > 0, href: "/hub/weekly" },
  ];

  const flow: { title: string; status: string; done: boolean; href: string }[] = [
    {
      title: "Start Up",
      status: data.intentionSet ? "intention set ✓" : "not started",
      done: data.intentionSet,
      href: "/start-up",
    },
    {
      title: "Today",
      status: `${data.mitDone}/${data.mitCount || 3} MITs done`,
      done: data.mitCount > 0 && data.mitDone === data.mitCount,
      href: "/my-day",
    },
    {
      title: "Wind Down",
      status: data.dayClosed
        ? "day closed ✓"
        : data.habitsTotal > 0
          ? `habits ${data.habitsDone}/${data.habitsTotal}`
          : "not closed",
      done: data.dayClosed,
      href: "/wind-down",
    },
  ];

  const hubs: { title: string; line: string; href: string; hot?: boolean }[] = [
    {
      title: "Tasks",
      line: `${data.openTasks} open${data.overdue ? ` · ${data.overdue} overdue` : ""}`,
      href: "/hub/tasks",
      hot: data.overdue > 0,
    },
    {
      title: "Cases",
      line: `${data.activeMatters} active${data.silent ? ` · ${data.silent} silent` : ""}`,
      href: "/hub/cases",
      hot: data.silent > 0,
    },
    {
      title: "Projects",
      line: `${data.activeProjects} active${
        data.nextProjectDeadline ? ` · next ${fmtDate(data.nextProjectDeadline)}` : ""
      }`,
      href: "/hub/projects",
    },
    {
      title: "Quick Drop",
      line: `${data.needsHome} need a home · ${data.ledgerCount} in the ledger`,
      href: "/hub/inbox",
    },
    {
      title: "Weekly review",
      line: `${data.due30} due in 30d · ${data.waiting} sitting with others`,
      href: "/hub/weekly",
    },
    {
      title: "Day ledger",
      line: `${(data.tenthsToday / 10).toFixed(1)}h entered today`,
      href: "/hub/time",
    },
    { title: "Notes", line: `${data.noteCount} notes`, href: "/hub/notes" },
    { title: "People", line: `${data.peopleCount} people`, href: "/hub/people" },
  ];

  return (
    <section className="pane">
      <div className="day-head">
        <div>
          <div className="kicker">ANDY&rsquo;S HQ · {dateLabel.toUpperCase()}</div>
          <h1 className="display-h1">{greeting}</h1>
        </div>
      </div>

      <div className="wk-glance cc-attention">
        {attention.map((a) => (
          <button
            key={a.label}
            type="button"
            className={`wk-stat cc-stat${a.hot ? " is-hot" : ""}`}
            onClick={() => router.push(a.href)}
          >
            <div className="wk-stat-num">{a.n}</div>
            <div className="wk-stat-label">{a.label}</div>
          </button>
        ))}
      </div>

      <div className="section-label">THE DAY</div>
      <div className="cc-flow">
        {flow.map((f) => (
          <button
            key={f.title}
            type="button"
            className={`cc-flow-card${f.done ? " is-done" : ""}`}
            onClick={() => router.push(f.href)}
          >
            <span className="cc-flow-title">{f.title}</span>
            <span className="cc-flow-status">{f.status}</span>
          </button>
        ))}
      </div>

      <div className="section-label">HUBS</div>
      <div className="case-grid cc-hubs">
        {hubs.map((h) => (
          <button
            key={h.title}
            type="button"
            className="case-card clickable cc-hub-card"
            onClick={() => router.push(h.href)}
          >
            <div className="case-name">{h.title}</div>
            <div className={`cc-hub-line${h.hot ? " is-hot" : ""}`}>{h.line}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
