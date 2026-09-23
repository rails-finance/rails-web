"use client";

// f(x) timeline run-collapse — tick rebalances, lifted out of the position
// page so every explorer's run specs live in one place per protocol.
// Module scope matters: ChainTruthTimeline memoises its rows on this array's
// identity, so a fresh one per render would recompute every row.

import { isFxEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard } from "@/components/shared/timeline-run-card";
import { renderRunFolders, CAUTION_FOLDER_BADGE } from "@/lib/shared/run-folders";

/** Runs shorter than this stay as individual cards. */
const MIN_TICK_REBALANCE_RUN = 3;

// Consecutive tick rebalances collapse into one expandable run row — the same
// client-side de-noising as the redemption/liquidation runs elsewhere, via
// ChainTruthTimeline's runs seam. Count-only: tickRebColls/tickRebFxusdDebts
// are whole-TICK facts, not provable per-position (event-shape.ts:1687–1693),
// so a Σ pair here would misstate this position's own delta. Module-scope so
// the timeline's row memo keeps a stable identity.
export const FX_TICK_REBALANCE_RUNS: TimelineRunSpec[] = [
  {
    match: (e) => isFxEvent(e) && e.context.data.eventType === "tickRebalance",
    min: MIN_TICK_REBALANCE_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_TICK_REBALANCE_RUN, (events, folder) => (
        <TimelineRunCard
          key={folder.key}
          count={events.length}
          memberNoun="tick rebalance"
          tone="caution"
          warningLabel="Rebalance"
          folder
          folderBadge={CAUTION_FOLDER_BADGE}
          firstTimestamp={events[0].timestamp}
          lastTimestamp={events[events.length - 1].timestamp}
          isFirst={folder.isFirst}
          isLast={folder.isLast}
        >
          {folder.children}
        </TimelineRunCard>
      )),
  },
];
