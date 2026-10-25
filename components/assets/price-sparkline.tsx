// A 30-day price line, no axis: the shape of the month beside a row's figure.

const W = 100;
const H = 28;
const PAD = 2;

export function PriceSparkline({
  points,
  label,
  className,
}: {
  points: readonly [number, number][];
  label: string;
  className?: string;
}) {
  if (points.length < 2) return <span className={className} aria-hidden />;
  const first = points[0][0];
  const span = Math.max(1, points[points.length - 1][0] - first);
  const values = points.map((p) => p[1]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (d: number) => ((d - first) / span) * W;
  const y = (v: number) => (hi === lo ? H / 2 : PAD + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD));
  const up = values[values.length - 1] >= values[0];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`block overflow-visible ${className ?? ""}`}
      role="img"
      aria-label={label}
      data-price-sparkline={points.length}
    >
      <path
        d={points.map(([d, v], i) => `${i === 0 ? "M" : "L"}${x(d).toFixed(2)},${y(v).toFixed(2)}`).join("")}
        fill="none"
        className={up ? "stroke-green-500" : "stroke-red-500"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** "+2.4%", "−0.8%". */
export function fmtChange(c: number): string {
  const pct = c * 100;
  if (Math.abs(pct) < 0.05) return "0.0%";
  const s = Math.abs(pct) < 10 ? Math.abs(pct).toFixed(1) : Math.round(Math.abs(pct)).toString();
  return `${pct >= 0 ? "+" : "−"}${s}%`;
}
