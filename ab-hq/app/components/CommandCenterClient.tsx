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

  const hubs: { title: string; line: string; sub?: string; href: string; hot?: boolean }[] = [
    {
      title: "Tasks",
      line: `${data.openTasks} open${data.overdue ? ` · ${data.overdue} overdue` : ""}`,
      sub: data.upNext[0] ? `next: ${data.upNext[0].title}` : undefined,
      href: "/hub/tasks",
      hot: data.overdue > 0,
    },
    {
      title: "Cases",
      line: `${data.activeMatters} active${data.silent ? ` · ${data.silent} silent` : ""}`,
      sub: data.silentTop[0]
        ? `quietest: ${data.silentTop[0].name} (${data.silentTop[0].daysSilent ?? "—"}d)`
        : undefined,
      href: "/hub/cases",
      hot: data.silent > 0,
    },
    {
      title: "Projects",
      line: `${data.activeProjects} active`,
      sub: data.nextProjectName
        ? `${data.nextProjectName} due ${fmtDate(data.nextProjectDeadline!)}`
        : undefined,
      href: "/hub/projects",
    },
    {
      title: "Quick Drop",
      line: `${data.needsHome} need a home · ${data.ledgerCount} in the ledger`,
      sub: data.unfiledLatest ? `“${data.unfiledLatest.slice(0, 60)}”` : undefined,
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
      sub: data.touchedToday
        ? `${data.touchedToday} matter${data.touchedToday === 1 ? "" : "s"} touched`
        : undefined,
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

      <div className="section-label">UP NEXT · {data.upNext.length}</div>
      {data.upNext.map((item, i) => {
        const days = Math.round(
          (new Date(`${item.date}T12:00:00`).getTime() -
            new Date(`${data.today}T12:00:00`).getTime()) /
            86400000
        );
        return (
          <div
            key={`${item.date}-${i}`}
            className="wk-due-row clickable"
            onClick={() => router.push("/hub/tasks")}
          >
            <span className={`wk-due-date${days <= 3 ? " is-near" : ""}`}>
              {fmtDate(item.date)}
              <span className="wk-due-in">
                {days === 0 ? "today" : days === 1 ? "tmrw" : `${days}d`}
              </span>
            </span>
            <div className="task-body">
              <div className="task-title">{item.title}</div>
              <div className="meta">
                <span
                  className={
                    item.kind === "task" ? "kind-task" : item.kind === "event" ? "kind-event" : "kind-deadline"
                  }
                >
                  {item.kind.toUpperCase()}
                </span>
                {item.matterName && (
                  <span className="meta-scope">{item.matterName.toUpperCase()}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {data.upNext.length === 0 && (
        <div className="empty-note">Nothing dated in the next 30 days.</div>
      )}

      {(data.overdueTop.length > 0 || data.silentTop.length > 0) && (
        <div className="cc-cols">
          {data.overdueTop.length > 0 && (
            <div>
              <div className="section-label overdue">OVERDUE · {data.overdue}</div>
              {data.overdueTop.map((t) => (
                <div
                  key={t.id}
                  className="wk-silent-row clickable"
                  onClick={() => router.push("/start-up")}
                >
                  <div className="task-body">
                    <div className="task-title">{t.title}</div>
                    <div className="meta">
                      {t.matterName && (
                        <span className="meta-scope">{t.matterName.toUpperCase()}</span>
                      )}
                    </div>
                  </div>
                  <span className="wk-silent-age">{fmtDate(t.doDate)}</span>
                </div>
              ))}
            </div>
          )}
          {data.silentTop.length > 0 && (
            <div>
              <div className="section-label overdue">GONE SILENT · {data.silent}</div>
              {data.silentTop.map((m) => (
                <div
                  key={m.name}
                  className="wk-silent-row clickable"
                  onClick={() => router.push("/hub/weekly")}
                >
                  <div className="task-body">
                    <div className="task-title">{m.name}</div>
                    <div className="meta">
                      {m.openCount > 0 ? (
                        <span className="kind-task">{m.openCount} OPEN, NONE DATED</span>
                      ) : (
                        <span className="case-noaction">NO NEXT ACTION</span>
                      )}
                    </div>
                  </div>
                  <span className="wk-silent-age">
                    {m.daysSilent === null ? "never" : `${m.daysSilent}d`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
            {h.sub && <div className="cc-hub-sub">{h.sub}</div>}
          </button>
        ))}
      </div>
    </section>
  );
}
