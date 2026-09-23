"use client";

// Maple timeline run-collapse — withdrawal-queue fills, lifted out of the
// wallet page so every explorer's run specs live in one place per protocol.
// Module scope matters: ChainTruthTimeline memoises its rows on this array's
// identity, so a fresh one per render would recompute every row.

import { isMapleEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard } from "@/components/shared/timeline-run-card";
import { renderRunFolders, PAID_OUT_FOLDER_BADGE } from "@/lib/shared/run-folders";
import { sumBySymbol } from "@/lib/shared/run-aggregates";

/** Runs shorter than this stay as individual cards. */
const MIN_QUEUE_FILL_RUN = 3;

// Consecutive withdrawal-queue fills collapse into one expandable run row —
// the FIFO queue processes a wallet's pending requests back to back once
// liquidity lands, and a wallet parked deep in the queue can pick up a burst
// of them; owner actions (deposit/withdraw/request/cancel) always stand as
// their own rows. Module-scope so the timeline's row memo keeps a stable id.
export const MAPLE_QUEUE_FILL_RUNS: TimelineRunSpec[] = [
  {
    match: (e) => isMapleEvent(e) && e.context.data.eventType === "request_fill",
    min: MIN_QUEUE_FILL_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_QUEUE_FILL_RUN, (events, folder) => {
        const paidOut = sumBySymbol(
          events
            .filter(isMapleEvent)
            .map((e) => ({ symbol: e.context.data.assetSymbol, amount: e.context.data.assetsDelta })),
        );
        return (
          <TimelineRunCard
            key={folder.key}
            count={events.length}
            memberNoun="queue fill"
            spineIcon="external"
            aggregates={Array.from(paidOut, ([symbol, value]) => ({
              verb: "Paid out",
              value,
              symbol,
              provWhat: "Assets paid out",
            }))}
            folder
            folderBadge={PAID_OUT_FOLDER_BADGE}
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
