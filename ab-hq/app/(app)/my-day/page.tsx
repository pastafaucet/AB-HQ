import TaskListClient from "@/app/components/TaskListClient";
import CapacityBar from "@/app/components/CapacityBar";
import ScheduleGrid from "@/app/components/ScheduleGrid";
import { DELEGATIONS } from "@/lib/data";
import { getMyDayData } from "@/lib/queries";

export const metadata = { title: "My Day · AB HQ" };
export const dynamic = "force-dynamic";

export default async function MyDayPage() {
  const { tasks, matters, today } = await getMyDayData();
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">MY DAY</div>
            <h1 className="display-h1">{dateLabel}</h1>
          </div>
          <div className="day-head-summary">
            2 DUE · 1 OVERDUE
            <br />
            2 HEARINGS THIS WEEK
          </div>
        </div>

        <TaskListClient initialTasks={tasks} matters={matters} today={today} />
      </section>

      <aside className="rail">
        <CapacityBar />
        <ScheduleGrid />

        {/* Active matters (from the database) */}
        <div className="rail-block">
          <div className="rail-head">
            <div className="rail-label">ACTIVE MATTERS</div>
            <span className="section-link">All →</span>
          </div>
          {matters.map((m) => (
            <div className="matter-row" key={m.id}>
              <span className="agenda-dot" style={{ background: "#5b8cff" }} />
              <div className="matter-body">
                <div className="matter-name">{m.name}</div>
                <div className="matter-sub">
                  {m.status.toUpperCase()} · {m.client}
                </div>
              </div>
              <div className="matter-next" style={{ color: m.nextColor }}>
                {m.next}
              </div>
            </div>
          ))}
        </div>

        {/* Delegations awaiting (static — not in the V1 data model yet) */}
        <div className="rail-block">
          <div className="rail-label">DELEGATIONS AWAITING · {DELEGATIONS.length}</div>
          {DELEGATIONS.map((d) => (
            <div className="deleg-row" key={d.id}>
              <span className="agenda-dot" style={{ background: "#8b7cf0" }} />
              <div className="deleg-body">
                <div className="deleg-title">{d.title}</div>
                <div className="deleg-who">{d.who}</div>
              </div>
              <div className="deleg-wait">{d.waiting}</div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
