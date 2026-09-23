// Aave V4 spoke timeline run-collapse — mirrors lib/aave-v3/timeline-runs.tsx.
// ----------------------------------------------------------------------------
// A keeper's liquidation sweep across a spoke's reserves arrives as several
// liquidation rows back to back — a thing done TO the position, not by it —
// so a long enough stretch of them collapses into one expandable run row via
// ChainTruthTimeline's runs seam. V4 spokes have no position-move legs the
// way V3's aToken transfers do, so this is the only run kind here.
//
// Module scope matters: ChainTruthTimeline memoises its rows on this array's
// identity, so a fresh one per render recomputes every row.

"use client";

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV4Event } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard, type RunAggregate } from "@/components/shared/timeline-run-card";
import { renderRunFolders, DANGER_FOLDER_BADGE } from "@/lib/shared/run-folders";
import { sumBySymbol } from "@/lib/shared/run-aggregates";

/** Runs shorter than this stay as individual cards. */
const MIN_LIQUIDATION_RUN = 4;

export const AAVE_V4_TIMELINE_RUNS: TimelineRunSpec[] = [
  {
    match: (e: BaseActivityEvent) => isAaveV4Event(e) && e.context.data.eventType === "liquidation",
    min: MIN_LIQUIDATION_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_LIQUIDATION_RUN, (events, folder) => {
        const liqs = events.filter(isAaveV4Event);
        const repaid = sumBySymbol(
          liqs.map((e) => ({ symbol: e.context.data.reserveSymbol, amount: e.context.data.debtToCover })),
        );
        const seized = sumBySymbol(
          liqs.map((e) => ({
            symbol: e.context.data.collateralSymbol,
            amount: e.context.data.liquidatedCollateralAmount,
          })),
        );
        const aggregates: RunAggregate[] = [
          ...[...repaid].map(([symbol, value]) => ({ verb: "Repaid", value, symbol, provWhat: "Debt repaid" })),
          ...[...seized].map(([symbol, value]) => ({ verb: "Seized", value, symbol, provWhat: "Collateral seized" })),
        ];
        return (
          <TimelineRunCard
            key={folder.key}
            count={events.length}
            memberNoun="liquidation"
            tone="danger"
            warningLabel="Liquidations"
            aggregates={aggregates}
            folder
            folderBadge={DANGER_FOLDER_BADGE}
            firstTimestamp={events[0].timestamp}
            lastTimestamp={events[events.length - 1].timestamp}
            isFirst={folder.isFirst}
            isLast={folder.isLast}
          >
            {folder.children}
          </TimelineRunCard>
        );
      }),
  },
];
