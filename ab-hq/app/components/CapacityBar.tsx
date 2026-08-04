import type { Capacity } from "@/lib/data";

function fmtH(h: number): string {
  if (h <= 0) return "0h";
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

// Computed from today's task/event estimates (see MyDayClient).
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
        <span><i className="cap-dot seg-meet" />{fmtH(meetings)} meetings</span>
        <span><i className="cap-dot seg-focus" />{fmtH(focus)} focus</span>
        <span><i className="cap-dot seg-slack" />{fmtH(slack)} slack</span>
      </div>
      <div className="cap-note">{note}</div>
    </div>
  );
}
