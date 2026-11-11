import Link from "next/link";
import { fill, onPace, type Ring } from "@/lib/progress";

const R = 30;
const C = 2 * Math.PI * R;

function fmt(n: number, unit: Ring["unit"]): string {
  if (unit === "count") return String(n);
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

/** One progress ring: the fill is done / target; the tick marks where an even pace would be today. */
function RingCard({ ring }: { ring: Ring }) {
  const f = fill(ring);
  const ahead = !ring.note && ring.target > 0 && onPace(ring);
  const paceAt = ring.target > 0 ? Math.min(1, ring.pace / ring.target) : 0;
  const angle = paceAt * 2 * Math.PI - Math.PI / 2;
  const href =
    ring.title === "Billable"
      ? "/work/time"
      : ring.period.kind === "week"
        ? "/plan/week"
        : "/work/tasks";
  const behind = ring.pace - ring.done;
  const status = ring.note
    ? ring.note
    : ring.target === 0
      ? "nothing dated"
      : ring.done >= ring.target
        ? "done ✓"
        : ahead
          ? "on pace"
          : `${fmt(Math.round(behind * 10) / 10, ring.unit)}${ring.unit === "hours" ? "h" : ""} behind pace`;
  return (
    <Link
      href={href}
      className={`ring-card${ahead ? " is-ahead" : ring.target > 0 ? " is-behind" : ""}${ring.note ? " is-off" : ""}`}
    >
      <svg className="ring-svg" viewBox="0 0 80 80" aria-hidden="true">
        <circle className="ring-track" cx="40" cy="40" r={R} />
        {f > 0 && (
          <circle
            className="ring-fill"
            cx="40"
            cy="40"
            r={R}
            strokeDasharray={`${f * C} ${C}`}
            transform="rotate(-90 40 40)"
          />
        )}
        {paceAt > 0 && paceAt < 1 && (
          <line
            className="ring-pace"
            x1={40 + (R - 7) * Math.cos(angle)}
            y1={40 + (R - 7) * Math.sin(angle)}
            x2={40 + (R + 7) * Math.cos(angle)}
            y2={40 + (R + 7) * Math.sin(angle)}
          />
        )}
        <text className="ring-num" x="40" y="44" textAnchor="middle">
          {fmt(ring.done, ring.unit)}
        </text>
      </svg>
      <div className="ring-text">
        <div className="ring-title">
          {ring.title} ·{" "}
          {ring.period.kind === "week" ? "this week" : ring.period.label}
        </div>
        <div className="ring-of">
          {fmt(ring.done, ring.unit)} of {fmt(ring.target, ring.unit)}
          {ring.unit === "hours" ? " h" : ""}
        </div>
        <div className="ring-status">{status}</div>
      </div>
    </Link>
  );
}

export default function ProgressRings({ rings }: { rings: Ring[] }) {
  if (!rings.length) return null;
  return (
    <div className="ring-band">
      {rings.map((r) => (
        <RingCard key={r.key} ring={r} />
      ))}
    </div>
  );
}
