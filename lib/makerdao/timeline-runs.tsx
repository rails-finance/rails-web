"use client";

// MakerDAO timeline run-collapse — consecutive `grab` rows (Dog/Cat
// liquidations) collapse into one expandable run row via ChainTruthTimeline's
// runs seam. A vault bitten in slices during one price move collects several
// grabs back to back; owner frobs always stand as their own rows.
// Module scope matters: ChainTruthTimeline memoises its rows on this array's
// identity, so a fresh one per render would recompute every row.

import { isMakerDAOEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard, type RunAggregate } from "@/components/shared/timeline-run-card";
import { renderRunFolders, DANGER_FOLDER_BADGE } from "@/lib/shared/run-folders";
import { sumBySymbol } from "@/lib/shared/run-aggregates";
import { DAI_META } from "@/lib/makerdao/asset-catalog";

/** Runs shorter than this stay as individual cards — the four-row floor every
 *  explorer's liquidation run uses. */
const MIN_LIQUIDATION_RUN = 4;

export const MAKERDAO_LIQUIDATION_RUNS: TimelineRunSpec[] = [
  {
    match: (e) => isMakerDAOEvent(e) && e.context.data.eventType === "grab",
    min: MIN_LIQUIDATION_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_LIQUIDATION_RUN, (events, folder) => {
        const grabs = events.filter(isMakerDAOEvent);
        // `dink` is the collateral taken (signed, human). `dart` is NORMALISED
        // debt — DAI only once multiplied by the Vat rate at the block, which
        // the row carries as `rateAtBlock` when the filler has priced it. The
        // DAI leg is summed only when EVERY member carries the rate; a partial
        // sum would understate the write-down, so it is withheld instead.
        const seized = sumBySymbol(
          grabs.map((e) => ({
            symbol: e.context.data.collateralSymbol,
            amount: String(Math.abs(Number(e.context.data.dink) || 0)),
          })),
        );
        const haveRate = grabs.every((e) => e.context.data.rateAtBlock != null);
        const cleared = haveRate
          ? sumBySymbol(
              grabs.map((e) => ({
                symbol: DAI_META.symbol,
                amount: String(
                  Math.abs((Number(e.context.data.dart) || 0) * (Number(e.context.data.rateAtBlock) / 1e27)),
                ),
              })),
            )
          : new Map<string, number>();
        const aggregates: RunAggregate[] = [
          ...[...cleared].map(([symbol, value]) => ({ verb: "Cleared", value, symbol, provWhat: "Debt written down" })),
          ...[...seized].map(([symbol, value]) => ({ verb: "Seized", value, symbol, provWhat: "Collateral seized" })),
        ];
        const count = events.length;
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
