"use client";

// f(x) timeline run-collapse — tick rebalances, lifted out of the position
// page so every explorer's run specs live in one place per protocol.
// Module scope matters: ChainTruthTimeline memoises its rows on this array's
// identity, so a fresh one per render would recompute every row.

import { isFxEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import type { ReactNode } from "react";
import { TimelineRunCard, type RunAggregate } from "@/components/shared/timeline-run-card";
import { RevealTip } from "@/components/shared/reveal-tip";
import { fxBlocksChange, useFxSocializedReads } from "@/lib/fx/socialized-reads";
import { FX_POOLS, isFxPoolKey } from "@/lib/fx/asset-catalog";
import { renderRunFolders } from "@/lib/shared/run-folders";
import { formatNumber } from "@/lib/utils/format";

/** The run's noun: "tick rebalance" when every member targeted one tick,
 *  "pool-wide rebalance" when every member ran from the pool's top tick down,
 *  "rebalance" for a mix. */
function runKind(events: BaseActivityEvent[]): string {
  const pool = events.filter((e) => isFxEvent(e) && e.context.data.poolWide === true).length;
  return pool === 0 ? "tick rebalance" : pool === events.length ? "pool-wide rebalance" : "rebalance";
}

/** "5 tick rebalances", "7 pool-wide rebalances", or "9 rebalances" for a mix.
 *  Below sm the run card already prints the count before the lead, so the
 *  lead drops it there. */
function RunWords({ events }: { events: BaseActivityEvent[] }) {
  const kind = runKind(events);
  return (
    // data-prov-exempt: a row count, like the run card's own count pill.
    <span data-prov-exempt="" className="text-sm font-medium text-foreground">
      <span className="hidden sm:inline">{events.length} </span>
      {kind}
      {events.length === 1 ? "" : "s"}
    </span>
  );
}

/** The run's (i): what a run is, what it took from this position, and how
 *  the run is named. */
function RunInfo({
  events,
  change,
  normSym,
}: {
  events: BaseActivityEvent[];
  change: { coll: number; debt: number } | null;
  normSym: string;
}) {
  const kind = runKind(events);
  const tip = (
    <span className="block max-w-xs text-left">
      {events.length} {kind}s in a row on this timeline: keepers&rsquo; transactions on the pool, each moving the tick
      this position&rsquo;s shares sat in.
      {change ? (
        <>
          {" "}
          Together they took {formatNumber(Math.max(0, -change.coll))} {normSym} and{" "}
          {formatNumber(Math.max(0, -change.debt))} fxUSD of debt from this position, read from the pool before and
          after each block.
        </>
      ) : null}{" "}
      A run is named &ldquo;tick rebalances&rdquo; when each one targeted a single tick, &ldquo;pool-wide
      rebalances&rdquo; when each ran from the pool&rsquo;s top tick down, and &ldquo;rebalances&rdquo; for a mix.
    </span>
  );
  return (
    <RevealTip tip={tip} label={`About these ${events.length} ${kind}s`} focusable className="focus-ring rounded-full">
      <span
        data-prov-exempt=""
        aria-hidden
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-rb-400 text-[10px] font-semibold text-rb-500"
      >
        i
      </span>
    </RevealTip>
  );
}

/** One run folder, with what its rebalances took from this position: the
 *  position read at each member's block (the page's shared socialized reads),
 *  summed. */
function FxRebalanceRunCard({
  events,
  folder,
}: {
  events: BaseActivityEvent[];
  folder: { key: string; isLast: boolean; children: ReactNode[] };
}) {
  const socialized = useFxSocializedReads();
  const change = fxBlocksChange(
    socialized?.reads,
    events.map((e) => e.blockNumber),
  );
  const first = events.find(isFxEvent);
  const d = first?.context.data;
  const normSym = d && isFxPoolKey(d.pool) ? FX_POOLS[d.pool].normalizedSymbol : (d?.poolSymbol ?? "");
  const aggregates: RunAggregate[] | undefined = change
    ? [
        {
          verb: "This position lost",
          value: Math.max(0, -change.coll),
          symbol: normSym,
          provWhat: `This position's collateral change (getPosition at each block and the block before, ${normSym})`,
        },
        {
          verb: "Debt repaid",
          value: Math.max(0, -change.debt),
          symbol: "fxUSD",
          provWhat: "This position's fxUSD debt change (getPosition at each block and the block before)",
        },
      ]
    : undefined;
  return (
    <TimelineRunCard
      key={folder.key}
      count={events.length}
      memberNoun="rebalance"
      lead={<RunWords events={events} />}
      aggregates={aggregates}
      extraHeader={<RunInfo events={events} change={change} normSym={normSym} />}
      tone="caution"
      kindWord="Rebalance"
      folder
      firstTimestamp={events[0].timestamp}
      lastTimestamp={events[events.length - 1].timestamp}
      isLast={folder.isLast}
    >
      {folder.children}
    </TimelineRunCard>
  );
}

/** Runs shorter than this stay as individual cards. */
const MIN_TICK_REBALANCE_RUN = 3;

// Consecutive rebalances collapse into one expandable run row — the same
// client-side de-noising as the redemption/liquidation runs elsewhere, via
// ChainTruthTimeline's runs seam. The row names its members in words and sums
// what they took from this position (read per block); the members' own
// amounts are the whole tick's (or pool's), so those are never summed.
// Module-scope so the timeline's row memo keeps a stable identity.
export const FX_TICK_REBALANCE_RUNS: TimelineRunSpec[] = [
  {
    match: (e) => isFxEvent(e) && e.context.data.eventType === "tickRebalance" && !e.context.data.redemption,
    min: MIN_TICK_REBALANCE_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_TICK_REBALANCE_RUN, (events, folder) => (
        <FxRebalanceRunCard key={folder.key} events={events} folder={folder} />
      )),
  },
];
