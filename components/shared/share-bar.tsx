// One asset's share of its side on a position card's opened layer (rails-ops
// ui-jobs 209): a thin bar filled to the asset's oracle-USD share of the
// side's total, with the share in its tip.
// The fills are the structural side colours of the Lifetime flows panel
// (collateral blue, debt green).

import type { ReactNode } from "react";

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

/** The per-market lines: a plain list, or (on the opened card, given the
 *  side's priced total) a grid with each line's share bar (ui-jobs 209). */
export function ShareLines({ total, control, children }: { total?: number; control: ReactNode; children: ReactNode }) {
  if (total == null)
    return (
      <div className="text-xs mt-0.5 text-rb-500 tabular-nums space-y-0.5">
        {children}
        {control}
      </div>
    );
  return (
    <div className="mt-1.5 grid max-w-72 grid-cols-[auto_minmax(3rem,1fr)] items-center gap-x-3 gap-y-1 text-xs text-rb-500 tabular-nums">
      {children}
      {control && <div className="col-span-2">{control}</div>}
    </div>
  );
}

export function ShareLine({
  share,
  side,
  children,
}: {
  share: number | null;
  side: "collateral" | "debt";
  children: ReactNode;
}) {
  if (share == null) return <div>{children}</div>;
  return (
    <div className="contents">
      <div className="whitespace-nowrap">{children}</div>
      <ShareBar share={share} side={side} />
    </div>
  );
}
