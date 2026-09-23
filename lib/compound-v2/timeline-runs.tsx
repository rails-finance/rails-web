"use client";

// Compound V2 timeline run-collapse — liquidation + seize legs, lifted out of
// the wallet page so every explorer's run specs live in one place per protocol.
// Module scope matters: ChainTruthTimeline memoises its rows on this array's
// identity, so a fresh one per render would recompute every row.

import { isCompoundV2Event } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard, type RunAggregate } from "@/components/shared/timeline-run-card";
import { renderRunFolders, DANGER_FOLDER_BADGE } from "@/lib/shared/run-folders";
import { sumBySymbol } from "@/lib/shared/run-aggregates";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";

/** Runs shorter than this stay as individual cards. A keeper liquidation burst
 *  is at least 2 liquidations (~2 member rows each, once the seize legs the
 *  index merges alongside them are counted), so the row floor is doubled. */
const MIN_LIQUIDATION_RUN = 4;

// Consecutive liquidation/seize rows collapse into one expandable run — a
// borrower caught by a keeper sweep collects several liquidations back to
// back, each trailed by the seize legs the index names separately (seize_out
// the borrower's loss, seize_burn the protocol's cut; seize_in — the
// liquidator's own receipt — sits outside the borrower's timeline and is
// never collected). Owner actions always stand as their own rows. Module-scope
// so the timeline's row memo keeps a stable identity.
export const COMPOUND_V2_LIQUIDATION_RUNS: TimelineRunSpec[] = [
  {
    match: (e) =>
      isCompoundV2Event(e) &&
      (e.context.data.eventType === "liquidation" ||
        e.context.data.eventType === "seize_out" ||
        e.context.data.eventType === "seize_burn"),
    min: MIN_LIQUIDATION_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_LIQUIDATION_RUN, (events, folder) => {
        // "Repaid" sums the debt each liquidation row itself covered (the index
        // merges a liquidation's own repay leg into it). "Seized" sums the
        // seize_out legs only, in the SAME cToken denomination the single seize
        // card's header uses — seize_burn moves no borrower-facing amount worth
        // summing (the protocol's own cut) and isn't part of either total.
        const repaid = sumBySymbol(
          events
            .filter(isCompoundV2Event)
            .filter((e) => e.context.data.eventType === "liquidation")
            .map((e) => ({ symbol: e.context.data.marketSymbol, amount: e.context.data.assetsDelta })),
        );
        const seized = sumBySymbol(
          events
            .filter(isCompoundV2Event)
            .filter((e) => e.context.data.eventType === "seize_out")
            .map((e) => {
              const m = COMPOUND_V2_MARKET_BY_KEY[e.context.data.market];
              return { symbol: m?.cSymbol ?? `c${e.context.data.marketSymbol}`, amount: e.context.data.cTokensDelta };
            }),
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
            aggregates={aggregates}
            tone="danger"
            warningLabel="Liquidations"
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
