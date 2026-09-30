// One asset's share of its side on a position card's opened layer (rails-ops
// ui-jobs 209): a thin bar filled to the asset's oracle-USD share of the
// side's total, with the share in its tip.
// The fills are the structural side colours of the Lifetime flows panel
// (collateral blue, debt green).

const FILL = { collateral: "bg-blue-500", debt: "bg-green-400" } as const;

export function ShareBar({ share, side }: { share: number; side: keyof typeof FILL }) {
  const pct = Math.max(0, Math.min(1, share)) * 100;
  const label = `${pct < 1 && pct > 0 ? "under 1" : Math.round(pct)}% of the ${side}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-share-bar=""
      className="block h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-rb-200 dark:bg-rb-500/30"
    >
      <span className={`block h-full rounded-full ${FILL[side]}`} style={{ width: `${Math.max(pct, 2)}%` }} />
    </span>
  );
}
