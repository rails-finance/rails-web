"use client";

/**
 * Inline collateral/debt bars rendered under an event header to visualise how
 * much this event moved the position relative to the position's lifetime peak.
 *
 * Originally built for Liquity troves (see `lib/liquity/use-trove-bars.tsx`)
 * but the shape is generic: any lending/borrowing protocol with a two-sided
 * `{ coll, debt }` state can produce PositionBarData and render the same bars.
 *
 * Two columns matching the expanded detail panel (`grid grid-cols-2 gap-6`
 * inside `px-4`):
 *   - Left column = Collateral (blue family)
 *   - Right column = Debt (green family)
 *
 * Each column has two stacked bars:
 *   - Top bar = the value transacted in this event (signed delta magnitude,
 *     green/blue for additions, darker tier for removals)
 *   - Bottom bar = the total state of that side after the event
 *
 * Both bars in a column share the same scale (the position's lifetime peak
 * for that side) so the transacted bar is directly proportional to the
 * position size — a small repay on a big position reads as small, a full
 * close reads as 100%. The visual answers two questions per event at a
 * glance: "how big was the shift on each side?" (top bars) and "where
 * does that leave the position?" (bottom bars).
 */

export interface PositionBarData {
  /** Current collateral in native units (post-event) */
  coll: number;
  /** Current debt in native units (post-event) */
  debt: number;
  /** Signed delta from previous owner event — positive = added, negative = removed */
  collDelta: number;
  debtDelta: number;
  /** Per-side denominator: this position's lifetime peak */
  collScale: number;
  debtScale: number;
}

// Two-tier per side, same colour family. Additions use the vivid POP; removals
// and underlying totals sit in BASE — softer in light mode (pale) and deep in
// dark mode (saturated navy / green) so the bars stay sympathetic to the
// surface behind them.
const COLL_POP = "bg-blue-500 dark:bg-blue-500";
const COLL_BASE = "bg-blue-200 dark:bg-blue-900";

const DEBT_POP = "bg-green-500 dark:bg-green-500";
const DEBT_BASE = "bg-green-200 dark:bg-green-900";

function pct(value: number, scale: number): number {
  if (scale <= 0) return 0;
  return Math.max(0, Math.min(100, (value / scale) * 100));
}

// `data-bar` names each bar for a verifier (the change or balance bar of one
// side); the fill's inline width is the figure it draws.
function Bar({ width, fill, name }: { width: number; fill?: string; name: string }) {
  return (
    <div className="relative h-1 w-full" data-bar={name}>
      {fill && width > 0 && (
        <div className={`absolute inset-y-0 left-0 rounded-full ${fill}`} style={{ width: `${width}%` }} />
      )}
    </div>
  );
}

function Column({
  side,
  delta,
  total,
  scale,
  popFill,
  baseFill,
  showChange,
  showBalance,
}: {
  side: "coll" | "debt";
  delta: number;
  total: number;
  scale: number;
  popFill: string;
  baseFill: string;
  showChange: boolean;
  showBalance: boolean;
}) {
  const totalPct = pct(total, scale);
  const deltaPct = pct(Math.abs(delta), scale);
  const deltaFill = delta > 0 ? popFill : delta < 0 ? baseFill : undefined;
  return (
    <div className="flex flex-col gap-1">
      {showChange && <Bar width={deltaPct} fill={deltaFill} name={`${side}-change`} />}
      {showBalance && <Bar width={totalPct} fill={baseFill} name={`${side}-balance`} />}
    </div>
  );
}

export function PositionBar({
  data,
  showChange = true,
  showBalance = true,
}: {
  data: PositionBarData;
  showChange?: boolean;
  showBalance?: boolean;
}) {
  if (!showChange && !showBalance) return null;
  return (
    <div className="grid grid-cols-2 gap-6" aria-hidden data-position-bar="">
      <Column
        side="coll"
        delta={data.collDelta}
        total={data.coll}
        scale={data.collScale}
        popFill={COLL_POP}
        baseFill={COLL_BASE}
        showChange={showChange}
        showBalance={showBalance}
      />
      <Column
        side="debt"
        delta={data.debtDelta}
        total={data.debt}
        scale={data.debtScale}
        popFill={DEBT_POP}
        baseFill={DEBT_BASE}
        showChange={showChange}
        showBalance={showBalance}
      />
    </div>
  );
}
