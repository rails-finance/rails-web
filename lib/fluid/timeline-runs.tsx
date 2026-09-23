"use client";

// Fluid timeline run-collapse — tick-sweep liquidations/absorptions, lifted
// out of the NFT page so every explorer's run specs live in one place per protocol.
// Module scope matters: ChainTruthTimeline memoises its rows on this array's
// identity, so a fresh one per render would recompute every row.

import { isFluidEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard, type RunAggregate } from "@/components/shared/timeline-run-card";
import { renderRunFolders, DANGER_FOLDER_BADGE } from "@/lib/shared/run-folders";
import { sumBySymbol } from "@/lib/shared/run-aggregates";

/** Runs shorter than this stay as individual cards. */
const MIN_LIQUIDATION_RUN = 4;

// A tick sweep can touch a position several times in one bot pass —
// consecutive liquidation/absorption rows collapse into one expandable run
// row, via ChainTruthTimeline's runs seam. Owner actions always stand as
// their own rows. Module-scope so the timeline's row memo keeps a stable
// identity.
export const FLUID_LIQUIDATION_RUNS: TimelineRunSpec[] = [
  {
    match: (e) =>
      isFluidEvent(e) && (e.context.data.eventType === "liquidated" || e.context.data.eventType === "absorbed"),
    min: MIN_LIQUIDATION_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_LIQUIDATION_RUN, (events, folder) => {
        const first = events[0];
        const supplySymbol = isFluidEvent(first) ? first.context.data.supplySymbol : null;
        const borrowSymbol = isFluidEvent(first) ? first.context.data.borrowSymbol : null;
        // Smart vaults (DEX-share legs) carry no display symbol on one or both
        // sides — a Σ pair would misstate a share amount as a token amount, so
        // the run renders count-only there, matching the single-event card's
        // own token-less liquidation row.
        const aggregates: RunAggregate[] | undefined =
          supplySymbol && borrowSymbol
            ? [
                ...Array.from(
                  sumBySymbol(
                    events
                      .filter(isFluidEvent)
                      .map((e) => ({ symbol: e.context.data.supplySymbol, amount: e.context.data.colDelta })),
                  ),
                  ([symbol, value]): RunAggregate => ({ verb: "Seized", value, symbol, provWhat: "Collateral seized" }),
                ),
                ...Array.from(
                  sumBySymbol(
                    events
                      .filter(isFluidEvent)
                      .map((e) => ({ symbol: e.context.data.borrowSymbol, amount: e.context.data.debtDelta })),
                  ),
                  ([symbol, value]): RunAggregate => ({ verb: "Repaid", value, symbol, provWhat: "Debt repaid" }),
                ),
              ]
            : undefined;
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
            firstTimestamp={first.timestamp}
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
