"use client";

// Dolomite timeline run-collapse — the BORROWER's two legs of a liquidation
// (`liquidation`: debt written down; `seize_out`: collateral taken) arrive as
// paired rows, and an account liquidated across several markets in one keeper
// pass collects them back to back — passive/third-party events, so they
// collapse into one expandable run row via ChainTruthTimeline's runs seam.
// The liquidator-side legs (seize_in / liquidation_payout) are that account's
// own acts and stand as their own rows, as the single event card treats them.
// Module scope matters: ChainTruthTimeline memoises its rows on this array's
// identity, so a fresh one per render would recompute every row.

import { isDolomiteEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard, type RunAggregate } from "@/components/shared/timeline-run-card";
import { renderRunFolders, DANGER_FOLDER_BADGE } from "@/lib/shared/run-folders";
import { sumBySymbol } from "@/lib/shared/run-aggregates";

/** Runs shorter than this stay as individual cards — the four-row floor every
 *  explorer's liquidation run uses. One liquidation is two rows (debt leg +
 *  seize leg), so this is a two-liquidation floor. */
const MIN_LIQUIDATION_RUN = 4;

export const DOLOMITE_LIQUIDATION_RUNS: TimelineRunSpec[] = [
  {
    match: (e) =>
      isDolomiteEvent(e) && (e.context.data.eventType === "liquidation" || e.context.data.eventType === "seize_out"),
    min: MIN_LIQUIDATION_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_LIQUIDATION_RUN, (events, folder) => {
        const legs = events.filter(isDolomiteEvent);
        const debtLegs = legs.filter((e) => e.context.data.eventType === "liquidation");
        const cleared = sumBySymbol(
          debtLegs.map((e) => ({
            symbol: e.context.data.marketSymbol,
            amount: String(Math.abs(Number(e.context.data.weiDelta) || 0)),
          })),
        );
        const seized = sumBySymbol(
          legs
            .filter((e) => e.context.data.eventType === "seize_out")
            .map((e) => ({
              symbol: e.context.data.marketSymbol,
              amount: String(Math.abs(Number(e.context.data.weiDelta) || 0)),
            })),
        );
        const aggregates: RunAggregate[] = [
          ...[...cleared].map(([symbol, value]) => ({ verb: "Cleared", value, symbol, provWhat: "Debt written down" })),
          ...[...seized].map(([symbol, value]) => ({ verb: "Seized", value, symbol, provWhat: "Collateral seized" })),
        ];
        // Count LIQUIDATIONS (debt legs), not rows — the seize leg is the same
        // liquidation's collateral side. Seize legs alone count rows.
        const count = debtLegs.length || events.length;
        return (
          <TimelineRunCard
            key={folder.key}
            count={count}
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
