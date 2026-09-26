"use client";

// Where the position stood at one event's block — the served `getCDP` reading,
// drawn in the same StatCard grid Morpho's chain-state cards draw their
// after-balances in.
//
// THREE RULES, each one a way this figure can be read as saying something it
// does not.
//
// 1. IT IS A READING, NOT A RUNNING BALANCE. Nothing here accumulates the
//    position's own deltas to reach it, and nothing may: a redemption moves debt
//    across the whole line and names no position (rails-ops decisions/0032), so
//    an accumulated figure would be short by whatever the redemptions took and
//    the chain would not agree with it. The note under the grid says so, and the
//    receipt on every figure traces to the call and its block.
//
// 2. IT BELONGS TO THE BLOCK, NOT TO THE EVENT. One reading covers every event
//    in its block, and 3,941 of production's 11,972 rows are not the last event
//    in theirs. `positionEventsInBlock` is what tells the two apart, so the
//    heading is the thing that changes: at 1 (or at 0, a line-scope row whose
//    block holds none of this position's events) it reads "After this event";
//    above 1 it counts the block's events instead, and the note says the reading
//    covers them all. Quiet where the figure is this event's alone,
//    unmistakable where it is not.
//
// 3. AN ABSENT READING IS NOT A ZERO. A custody Transfer moves neither axis, so
//    it is not a block the sweep stops at: 1,867 of production's 4,988 position
//    Transfers have no reading. Those draw a sentence and no grid. A measured
//    zero draws the grid with "0" in it, and never goes through
//    `fmtHeaderMagnitude`, which renders zero as the empty string (rails-ops
//    TO-DO-ui-jobs item 74) — the grid's own `formatCompact` keeps it.
//
// EARMARKED IS SHOWN, AND ONLY BECAUSE THE HEADING NAMES THE BLOCK. Decision
// 0032 point 6 permits stating it as of the block it was read at and forbids
// carrying it anywhere else. All three figures here come from one call at one
// block, the note says the amount grows every block, and nothing on this card
// puts it beside a figure from another block.

import type { AlchemixStateAtBlockFromReading } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { formatUnitsExact } from "@/lib/utils/format";
import { OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import { stateAtBlockFromReadingProv, type AlchemixCoords } from "@/lib/alchemix/event-provenance";

const block = (n: number) => n.toLocaleString("en-US");

/** Both alAssets and the MYT share count carry 18 decimals, the same scale the
 *  rest of this card reads its emitted amounts at. */
const DECIMALS = 18;

export interface AlchemixStateAtBlockProps {
  state: AlchemixStateAtBlockFromReading | undefined;
  /** The synthetic's ticker — debt and earmarked are denominated in it. */
  syntheticSymbol: string;
  /** The vault share ticker. Collateral is the SHARE COUNT, never the asset
   *  underneath: the share price lives on a reading of its own and the two need
   *  not have been taken at the same block. */
  mytSymbol: string;
  /** This event's own block, for the sentence an unavailable reading draws —
   *  the wire sends no block with one, because the figures it has none of would
   *  mean nothing without it. */
  eventBlock: number | undefined;
  coords: AlchemixCoords;
}

export function AlchemixStateAtBlock({
  state,
  syntheticSymbol,
  mytSymbol,
  eventBlock,
  coords,
}: AlchemixStateAtBlockProps) {
  // Absent on Transmuter rows, which have neither axis.
  if (!state) return null;

  if (state.status !== "stated" || state.blockNumber == null) {
    const at = eventBlock != null ? ` at block ${block(eventBlock)}` : "";
    const why =
      state.reason === "reading-stale"
        ? `The reading${at} did not complete, so what this position held here is not stated.`
        : `No reading was taken${at}. This event moved neither of this position's axes, so it is not a block the reading stops at, and what this position held here is not stated.`;
    return (
      <p className="mt-1 border-t border-rb-200 px-5 pb-3 pt-2 text-[11px] leading-relaxed text-rb-500 dark:border-rb-800">
        {why}
      </p>
    );
  }

  const atBlock = state.blockNumber;
  const shared = state.positionEventsInBlock > 1;

  const axis = (label: string, raw: string | null, symbol: string): ChainTruthStat | null => {
    if (raw == null) return null;
    return {
      label,
      value: formatUnitsExact(raw, DECIMALS),
      symbol,
      prov: stateAtBlockFromReadingProv(label, symbol, raw, atBlock, state.positionEventsInBlock, coords, DECIMALS),
    };
  };

  const stats = [
    axis("Debt", state.debtRaw, syntheticSymbol),
    axis("Collateral", state.collateralRaw, mytSymbol),
    axis("Set aside for repayment", state.earmarkedRaw, syntheticSymbol),
  ].filter((s): s is ChainTruthStat => s != null);

  if (stats.length === 0) return null;

  const showsEarmarked = state.earmarkedRaw != null;

  return (
    <div className="mt-1 border-t border-rb-200 pt-2 dark:border-rb-800">
      <h4 className={`${OVERLAY_HEADING} px-5 text-rb-500`}>
        {shared ? `After this block’s ${state.positionEventsInBlock} events` : "After this event"}
      </h4>
      <ChainTruthDetail stats={stats} />
      <p className="px-5 pb-3 text-[11px] leading-relaxed text-rb-500">
        Read from the Alchemist at block {block(atBlock)}
        {shared ? (
          <>
            , where {state.positionEventsInBlock} of this position&rsquo;s events landed. One reading covers them all,
            so these figures are where it stood after the last of them. Nothing here is worked out from the events on
            this page.
          </>
        ) : (
          <>, not worked out from the events on this page.</>
        )}{" "}
        Collateral is the vault share count.
        {showsEarmarked ? (
          <> The amount set aside for repayment grows every block, so it is true at that block and at no other.</>
        ) : null}
      </p>
    </div>
  );
}
