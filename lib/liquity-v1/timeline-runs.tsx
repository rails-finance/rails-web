"use client";

// Liquity V1 timeline run-collapse — redemption touches (the V2 trove
// treatment), lifted out of the wallet page so every explorer's run specs live
// in one place per protocol.
// Module scope matters: ChainTruthTimeline memoises its rows on this array's
// identity, so a fresh one per render would recompute every row.

import { isLiquityV1Event, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { RedemptionRunCard } from "@/components/shared/redemption-run-card";
import { renderRunFolders, runMemo } from "@/lib/shared/run-folders";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";

/** A redemption run's header sums, memoised per member list (`runMemo`). */
function redemptionSums(events: readonly BaseActivityEvent[]) {
  // Each member's delta is after − before over the emitted absolutes; the
  // folder carries the summed magnitudes (Cleared LUSD / Reduced ETH).
  let totalColl = 0;
  let totalDebt = 0;
  for (const e of events) {
    if (!isLiquityV1Event(e)) continue;
    totalColl += Math.abs(Number(e.context.data.collDelta) || 0);
    totalDebt += Math.abs(Number(e.context.data.debtDelta) || 0);
  }
  // The debt across the run, in time order: the earliest member's after
  // less its move, and the latest member's after.
  const chrono = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const early = chrono[0];
  const late = chrono[chrono.length - 1];
  const debtSpan: [number, number] | undefined =
    isLiquityV1Event(early) &&
    isLiquityV1Event(late) &&
    early.context.data.debtAfter != null &&
    late.context.data.debtAfter != null
      ? [
          Number(early.context.data.debtAfter) - (Number(early.context.data.debtDelta) || 0),
          Number(late.context.data.debtAfter),
        ]
      : undefined;
  return { totalColl, totalDebt, debtSpan };
}

// Consecutive redemption touches collapse into one expandable run row — the V2
// trove treatment, via ChainTruthTimeline's runs seam. A heavily redeemed V1
// Trove sitting low in the sorted list collects redemptions back to back;
// owner actions and liquidations always stand as their own rows. Module-scope
// so the timeline's row memo keeps a stable identity.
export const LIQUITY_V1_REDEMPTION_RUNS: TimelineRunSpec[] = [
  {
    match: (e) => isLiquityV1Event(e) && e.context.data.eventType === "redemption",
    // One act per redemption call (decision 0039, amended 2026-10-15).
    actKeyOf: (e) => e.id,
    render: (run, meta) =>
      renderRunFolders(run, meta, (events, folder) => {
        const { totalColl, totalDebt, debtSpan } = runMemo(events, redemptionSums);
        return (
          <RedemptionRunCard
            debtSpan={debtSpan}
            key={folder.key}
            count={events.length}
            totalColl={totalColl}
            totalDebt={totalDebt}
            collateralSymbol={COLLATERAL_SYMBOL}
            debtSymbol={DEBT_SYMBOL}
            firstTimestamp={events[0].timestamp}
            lastTimestamp={events[events.length - 1].timestamp}
            isLast={folder.isLast}
          >
            {folder.children}
          </RedemptionRunCard>
        );
      }),
  },
];
