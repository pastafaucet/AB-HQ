"use client";

import { useRouter } from "next/navigation";
import type { WeeklyReviewData, DueItem } from "@/lib/queries";

const MONTHS_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function fmtDate(iso: string, today: string): { label: string; days: number } {
  const [y, m, d] = iso.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const days = Math.round(
    (new Date(y, m - 1, d).getTime() - new Date(ty, tm - 1, td).getTime()) / 86400000
  );
  return { label: `${MONTHS_SHORT[m - 1]} ${d}`, days };
}

const KIND_LABEL: Record<DueItem["kind"], { text: string; cls: string }> = {
  deadline: { text: "DEADLINE", cls: "kind-deadline" },
  project: { text: "PROJECT", cls: "kind-deadline" },
  matter: { text: "MATTER", cls: "kind-deadline" },
  event: { text: "EVENT", cls: "kind-event" },
  task: { text: "TASK", cls: "kind-task" },
};

export default function WeeklyClient({ data }: { data: WeeklyReviewData }) {
  const router = useRouter();
  const { today } = data;

  const buckets = ["Chris", "Opposing Counsel", "Court", "Other"].filter((b) =>
    data.waiting.some((w) => w.bucket === b)
  );

  return (
    <>
      <section className="pane">
        <div className="day-head">
          <div>
            <div className="kicker">REVIEWS</div>
            <h1 className="display-h1">The whole book.</h1>
          </div>
          <div className="day-head-summary">
            {data.activeMatters} ACTIVE MATTERS
            <br />
            {data.entriesThisWeek} ENTRIES THIS WEEK
          </div>
        </div>

        <div className="wk-glance">
          <div className="wk-stat">
            <div className="wk-stat-num">{data.due.length}</div>
            <div className="wk-stat-label">DUE NEXT 30 DAYS</div>
          </div>
          <div className="wk-stat">
            <div className="wk-stat-num">{data.waiting.length}</div>
            <div className="wk-stat-label">SITTING WITH OTHERS</div>
          </div>
          <div className={`wk-stat${data.silent.length ? " is-hot" : ""}`}>
            <div className="wk-stat-num">{data.silent.length}</div>
            <div className="wk-stat-label">GONE SILENT</div>
          </div>
          <div className="wk-stat">
            <div className="wk-stat-num">{data.quiet.length}</div>
            <div className="wk-stat-label">NOTHING SCHEDULED</div>
          </div>
        </div>

        <div className="section-label">DUE IN THE NEXT 30 DAYS · {data.due.length}</div>
        {data.due.map((item, i) => {
          const f = fmtDate(item.date, today);
          const k = KIND_LABEL[item.kind];
          return (
            <div key={`${item.date}-${i}`} className="wk-due-row">
              <span className={`wk-due-date${f.days <= 7 ? " is-near" : ""}`}>
                {f.label}
                <span className="wk-due-in">
                  {f.days === 0 ? "today" : f.days === 1 ? "tmrw" : `${f.days}d`}
                </span>
              </span>
              <div className="task-body">
                <div className="task-title">{item.title}</div>
                <div className="meta">
                  <span className={k.cls}>{k.text}</span>
                  {item.matterName && (
                    <span className="meta-scope">{item.matterName.toUpperCase()}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {data.due.length === 0 && (
          <div className="empty-note">Nothing dated in the next 30 days.</div>
        )}

        <div className="section-label">SITTING WITH · {data.waiting.length}</div>
        {buckets.map((b) => (
          <div key={b} className="wk-bucket">
            <div className="wk-bucket-label">{b.toUpperCase()}</div>
            {data.waiting
              .filter((w) => w.bucket === b)
              .map((w) => (
                <div key={w.taskId} className="task-row">
                  <div className="task-body">
                    <div className="task-title">{w.title}</div>
                    <div className="meta">
                      {w.matterName && (
                        <span className="meta-scope">{w.matterName.toUpperCase()}</span>
                      )}
                      {w.doDate && (
                        <span className="time-tag">
                          {fmtDate(w.doDate, today).label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        ))}
        {data.waiting.length === 0 && (
          <div className="empty-note">
            Nothing marked as sitting with someone else. Tag tasks via the drawer&rsquo;s
            &ldquo;Sitting with&rdquo; control, or let capture routing do it.
          </div>
        )}

        <div className="section-label overdue">
          GONE SILENT · {data.silent.length} — NO ACTIVITY, NOTHING SCHEDULED
        </div>
        {data.silent.map((m) => (
          <div key={m.id} className="wk-silent-row clickable" onClick={() => router.push("/hub/cases")}>
            <div className="task-body">
              <div className="task-title">{m.name}</div>
              <div className="meta">
                {m.client && <span className="meta-scope">{m.client.toUpperCase()}</span>}
                {m.openCount > 0 ? (
                  <span className="kind-task">{m.openCount} OPEN, NONE DATED</span>
                ) : (
                  <span className="case-noaction">NO NEXT ACTION</span>
                )}
              </div>
            </div>
            <span className="wk-silent-age">
              {m.daysSilent === null ? "never touched" : `${m.daysSilent}d silent`}
            </span>
          </div>
        ))}
        {data.silent.length === 0 && (
          <div className="empty-note">No matter has gone silent. That&rsquo;s the goal.</div>
        )}

        {data.quiet.length > 0 && (
          <>
            <div className="section-label">
              TOUCHED RECENTLY, NOTHING SCHEDULED · {data.quiet.length}
            </div>
            {data.quiet.map((m) => (
              <div key={m.id} className="wk-silent-row">
                <div className="task-body">
                  <div className="task-title">{m.name}</div>
                  <div className="meta">
                    {m.client && <span className="meta-scope">{m.client.toUpperCase()}</span>}
                  </div>
                </div>
                <span className="wk-silent-age quiet">
                  {m.daysSilent === null ? "—" : `${m.daysSilent}d ago`}
                </span>
              </div>
            ))}
          </>
        )}
      </section>
    </>
  );
}
