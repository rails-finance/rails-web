"use client";

// LlamaLend timeline run-collapse — consecutive hard liquidations of the
// BORROWER's position by a third party collapse into one expandable run row
// via ChainTruthTimeline's runs seam. The liquidator-side row (the subject
// acted on someone else's position) and a self-liquidation (the borrower's
// own close from soft-liquidation) are the subject's own acts and stand as
// their own rows, exactly as the single event card treats them.
// Module scope matters: ChainTruthTimeline memoises its rows on this array's
// identity, so a fresh one per render would recompute every row.

import { isLlamalendEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard, type RunAggregate } from "@/components/shared/timeline-run-card";
import { renderRunFolders, DANGER_FOLDER_BADGE } from "@/lib/shared/run-folders";
import { sumBySymbol } from "@/lib/shared/run-aggregates";

/** Runs shorter than this stay as individual cards — the four-row floor every
 *  explorer's liquidation run uses. */
const MIN_LIQUIDATION_RUN = 4;

export const LLAMALEND_LIQUIDATION_RUNS: TimelineRunSpec[] = [
  {
    match: (e) =>
      isLlamalendEvent(e) &&
      e.context.data.eventType === "liquidation" &&
      (e.context.data.role ?? "borrower") === "borrower" &&
      !e.context.data.selfLiquidation,
    min: MIN_LIQUIDATION_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_LIQUIDATION_RUN, (events, folder) => {
        const liqs = events.filter(isLlamalendEvent);
        const cleared = sumBySymbol(
          liqs.map((e) => ({
            symbol: e.context.data.borrowedSymbol,
            amount: String(Math.abs(Number(e.context.data.debtDelta) || 0)),
          })),
        );
        const seized = sumBySymbol(
          liqs.map((e) => ({
            symbol: e.context.data.collateralSymbol,
            amount: String(Math.abs(Number(e.context.data.collateralDelta) || 0)),
          })),
        );
        const aggregates: RunAggregate[] = [
          ...[...cleared].map(([symbol, value]) => ({ verb: "Cleared", value, symbol, provWhat: "Debt written off" })),
          ...[...seized].map(([symbol, value]) => ({ verb: "Seized", value, symbol, provWhat: "Collateral taken" })),
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
