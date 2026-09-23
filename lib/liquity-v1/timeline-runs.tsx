"use client";

// Liquity V1 timeline run-collapse — redemption touches (the V2 trove
// treatment), lifted out of the wallet page so every explorer's run specs live
// in one place per protocol.
// Module scope matters: ChainTruthTimeline memoises its rows on this array's
// identity, so a fresh one per render would recompute every row.

import { isLiquityV1Event } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { RedemptionRunCard } from "@/components/shared/redemption-run-card";
import { renderRunFolders } from "@/lib/shared/run-folders";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";

/** Runs shorter than this stay as individual cards (the V2 trove threshold). */
const MIN_REDEMPTION_RUN = 4;

// Consecutive redemption touches collapse into one expandable run row — the V2
// trove treatment, via ChainTruthTimeline's runs seam. A heavily redeemed V1
// Trove sitting low in the sorted list collects redemptions back to back;
// owner actions and liquidations always stand as their own rows. Module-scope
// so the timeline's row memo keeps a stable identity.
export const LIQUITY_V1_REDEMPTION_RUNS: TimelineRunSpec[] = [
  {
    match: (e) => isLiquityV1Event(e) && e.context.data.eventType === "redemption",
    min: MIN_REDEMPTION_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_REDEMPTION_RUN, (events, folder) => {
        // Each member's delta is after − before over the emitted absolutes; the
        // folder carries the summed magnitudes (Cleared ETH / Reduced LUSD).
        let totalColl = 0;
        let totalDebt = 0;
        for (const e of events) {
          if (!isLiquityV1Event(e)) continue;
          totalColl += Math.abs(Number(e.context.data.collDelta) || 0);
          totalDebt += Math.abs(Number(e.context.data.debtDelta) || 0);
        }
        return (
          <RedemptionRunCard
            key={folder.key}
            count={events.length}
            totalColl={totalColl}
            totalDebt={totalDebt}
            collateralSymbol={COLLATERAL_SYMBOL}
            debtSymbol={DEBT_SYMBOL}
            firstTimestamp={events[0].timestamp}
            lastTimestamp={events[events.length - 1].timestamp}
            isFirst={folder.isFirst}
            isLast={folder.isLast}
          >
            {folder.children}
          </RedemptionRunCard>
        );
      }),
  },
];
