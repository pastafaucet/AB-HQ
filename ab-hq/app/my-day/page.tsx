import TaskRow, { TaskMeta } from "@/app/components/TaskRow";
import {
  MITS,
  ALSO_TODAY,
  IN_PROGRESS,
  SCHEDULE,
  MATTERS,
  DELEGATIONS,
} from "@/lib/data";

export const metadata = { title: "My Day · AB HQ" };

export default function MyDayPage() {
  // Pad MITs to three protected slots (scope: up to 3, always visible).
  const mitSlots = [0, 1, 2].map((i) => MITS[i] ?? null);
  const mitsDone = MITS.filter((t) => t.status === "Done").length;
  const openCount = ALSO_TODAY.length + IN_PROGRESS.length;

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">MY DAY</div>
            <h1 className="display-h1">Saturday, July 5</h1>
          </div>
          <div className="day-head-summary">
            2 DUE · 1 OVERDUE
            <br />
            2 HEARINGS THIS WEEK
          </div>
        </div>

        {/* --- Protected Top 3 MITs --- */}
        <div className="section-label tight">
          TODAY&rsquo;S 3 · {mitsDone}/{MITS.length} DONE
        </div>
        <div className="mit-list">
          {mitSlots.map((task, i) =>
            task ? (
              <div
                key={task.id}
                className={`mit-row${task.status === "Done" ? " is-done" : ""}`}
              >
                <div className="mit-num">
                  {task.status === "Done" ? "✓" : i + 1}
                </div>
                <div className="mit-body">
                  <div
                    className={`mit-title${
                      task.status === "Done" ? " is-done" : ""
                    }`}
                  >
                    {task.title}
                  </div>
                  <TaskMeta task={task} />
                </div>
                <div
                  className={`check mit-check${
                    task.status === "Done" ? " is-done" : ""
                  }`}
                >
                  {task.status === "Done" ? "✓" : ""}
                </div>
              </div>
            ) : (
              <div key={`empty-${i}`} className="mit-empty">
                <div className="mit-empty-num">{i + 1}</div>
                <div className="mit-empty-text">
                  Open slot — protect it or leave it clear.
                </div>
              </div>
            )
          )}
        </div>

        {/* --- Also today --- */}
        <div className="section-label">ALSO TODAY · {ALSO_TODAY.length}</div>
        {ALSO_TODAY.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}

        {/* --- In progress --- */}
        <div className="section-label">IN PROGRESS · {IN_PROGRESS.length}</div>
        {IN_PROGRESS.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--disabled-2)",
            marginTop: 28,
            letterSpacing: "0.06em",
          }}
        >
          {openCount} OPEN · KEEP THE THREE PROTECTED.
        </div>
      </section>

      <aside className="rail">
        {/* Schedule */}
        <div className="rail-block">
          <div className="rail-head">
            <div className="rail-label">SCHEDULE</div>
            <span className="section-link">Calendar →</span>
          </div>
          {SCHEDULE.map((s) => (
            <div className="agenda-row" key={s.id}>
              <div className="agenda-time">{s.time}</div>
              <span className="agenda-dot" style={{ background: s.dot }} />
              <div className="agenda-body">
                <div className="agenda-title">{s.title}</div>
                <div className="agenda-place">{s.place}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Active matters */}
        <div className="rail-block">
          <div className="rail-head">
            <div className="rail-label">ACTIVE MATTERS</div>
            <span className="section-link">All →</span>
          </div>
          {MATTERS.map((m) => (
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

        {/* Delegations awaiting */}
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
