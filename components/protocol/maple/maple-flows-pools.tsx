"use client";

// The pool switch over a Maple wallet's Lifetime flows: a wallet that has used
// both pools has one timeline per pool, since USDC and USDT are never added
// together (lib/maple/flows.ts). The chain toggle's segmented control; the
// event cards of the pool shown open into its ledger.

import { SEGMENT_SHELL, segmentClass } from "@/components/shared/chain-toggle";
import { useHydrated } from "@/hooks/useHydrated";
import { ctrlWaking } from "@/lib/shared/ui-grammar";
import type { MapleFlowsPool } from "@/hooks/useMapleFlows";

export function MapleFlowsPoolSwitch({
  pools,
  pool,
  onChange,
}: {
  pools: MapleFlowsPool[];
  pool: string | null;
  onChange: (pool: string) => void;
}) {
  const hydrated = useHydrated();
  if (pools.length < 2) return null;
  return (
    <div className="mb-3" data-maple-flows-pools="">
      <div className={SEGMENT_SHELL} role="group" aria-label="Pool" {...ctrlWaking(hydrated)}>
        {pools.map((p) => (
          <button
            key={p.pool}
            type="button"
            aria-pressed={p.pool === pool}
            onClick={() => onChange(p.pool)}
            className={segmentClass(p.pool === pool)}
          >
            {p.poolSymbol}
          </button>
        ))}
      </div>
    </div>
  );
}
