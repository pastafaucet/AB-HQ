import type { Capacity } from "@/lib/data";

// Computed from the day's scheduled tasks (see MyDayClient).
export default function CapacityBar({ data }: { data: Capacity }) {
  const { meetings, focus, slack, note } = data;
  const total = meetings + focus + slack || 1;
  const pct = (h: number) => `${(h / total) * 100}%`;
  return (
    <div className="rail-block">
      <div className="rail-label">CAPACITY</div>
      <div className="cap-bar">
        <span className="cap-seg seg-meet" style={{ width: pct(meetings) }} />
        <span className="cap-seg seg-focus" style={{ width: pct(focus) }} />
        <span className="cap-seg seg-slack" style={{ width: pct(slack) }} />
      </div>
      <div className="cap-legend">
        <span><i className="cap-dot seg-meet" />{meetings.toFixed(1)}h meetings</span>
        <span><i className="cap-dot seg-focus" />{focus.toFixed(1)}h focus</span>
        <span><i className="cap-dot seg-slack" />{slack.toFixed(1)}h slack</span>
      </div>
      <div className="cap-note">{note}</div>
    </div>
  );
}
