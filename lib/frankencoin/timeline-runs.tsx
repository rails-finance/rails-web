"use client";

// Frankencoin timeline run-collapse — keyed Dutch-auction slices, lifted out
// of the position page so every explorer's run specs live in one place per protocol.
// Module scope matters: ChainTruthTimeline memoises its rows on this array's
// identity, so a fresh one per render would recompute every row.

import { isFrankencoinEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard, type RunAggregate } from "@/components/shared/timeline-run-card";
import { renderRunFolders, DANGER_FOLDER_BADGE } from "@/lib/shared/run-folders";
import { sumBySymbol } from "@/lib/shared/run-aggregates";

/** Two slices are already the same settled auction — a keyed run needs no
 *  streak to justify collapsing (contrast the plain-streak redemption floor).
 *  The floor counts ROWS: every slice's tx also writes the position's
 *  MintingUpdate down as an auction_settlement row beside it, so a two-slice
 *  auction spans at least three rows while a single-slice auction (two rows)
 *  stays flat. */
const MIN_AUCTION_RUN = 3;

// Multi-bid Dutch auctions emit MULTIPLE ChallengeSucceeded slices for one
// challenge (event-shape.ts:1400) — group by (hub, challenge number), the
// same key the challenge forensics card uses, so a run never merges slices
// from two different auctions. Each slice's settlement tx ALSO writes an
// auction_settlement MintingUpdate row that lands between the slices —
// matching slices alone would split the run at every one of those echoes, so
// the run collects both row kinds. Settlement rows carry no challenge number;
// the neighbor test lets them ride and keys slice-to-slice through them. The
// header counts and sums the SLICES only (a settlement row is the same tx's
// write-down, not another auction outcome). Module-scope so the timeline's
// row memo keeps a stable identity.
export const FRANKENCOIN_AUCTION_RUNS: TimelineRunSpec[] = [
  {
    match: (e) =>
      isFrankencoinEvent(e) &&
      (e.context.data.eventType === "challenge_succeeded" || e.context.data.eventType === "auction_settlement"),
    min: MIN_AUCTION_RUN,
    sameRun: (prev, next) => {
      if (!isFrankencoinEvent(prev) || !isFrankencoinEvent(next)) return false;
      if (prev.context.data.hub !== next.context.data.hub) return false;
      const a = prev.context.data.challengeNumber;
      const b = next.context.data.challengeNumber;
      return a == null || b == null || a === b;
    },
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_AUCTION_RUN, (events, folder) => {
        const slices = events
          .filter(isFrankencoinEvent)
          .filter((e) => e.context.data.eventType === "challenge_succeeded");
        const sold = sumBySymbol(
          slices.map((e) => ({ symbol: e.context.data.collateralSymbol, amount: e.context.data.acquiredCollateral })),
        );
        const raised = sumBySymbol(slices.map((e) => ({ symbol: "ZCHF", amount: e.context.data.bid })));
        const aggregates: RunAggregate[] = [
          ...Array.from(sold, ([symbol, value]) => ({
            verb: "Sold",
            value,
            symbol,
            provWhat: "Collateral sold in the auction",
          })),
          ...Array.from(raised, ([symbol, value]) => ({
            verb: "Raised",
            value,
            symbol,
            provWhat: "ZCHF raised in the auction",
          })),
        ];
        return (
          <TimelineRunCard
            key={folder.key}
            count={slices.length}
            memberNoun="auction slice"
            aggregates={aggregates}
            tone="danger"
            warningLabel="Auction"
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
