"use client";

// Where the position stood at one transaction's block: the served `getCDP`
// reading, drawn in the same StatCard grid Morpho's chain-state cards draw
// their after-balances in.
//
// THREE RULES, each one a way this figure can be read as saying something it
// does not.
//
// 1. IT IS A READING, NOT A RUNNING BALANCE. Nothing here accumulates the
//    position's own deltas to reach it, and nothing may: a redemption moves debt
//    across the whole line and names no position (rails-ops decisions/0032), so
//    an accumulated figure would be short by whatever the redemptions took and
//    the chain would not agree with it.
//
// 2. IT BELONGS TO THE BLOCK, NOT TO THE EVENT. One reading covers every event
//    in its block, and 3,248 of production's 8,680 position-blocks hold more
//    than one. `positionEventsInBlock` is what tells the two apart, and the
//    heading is where it shows: at or below the card's own leg count the
//    reading covers what the card draws and nothing else, so the heading names
//    the transaction (or the lone event); above it the block holds events this
//    card does not draw, and the heading counts the block's instead.
//
// 3. AN ABSENT READING IS NOT A ZERO. A custody Transfer moves neither axis, so
//    it is not a block the sweep stops at: 1,867 of production's 4,988 position
//    Transfers have no reading. Those draw a sentence and no grid. A measured
//    zero draws the grid with "0" in it, and never goes through
//    `fmtHeaderMagnitude`, which renders zero as the empty string (rails-ops
//    TO-DO-ui-jobs item 74) — the grid's own `formatCompact` keeps it.
//
// WHAT THE CARD FACE SAYS ABOUT ALL THAT IS THE BLOCK, AND NOTHING ELSE. The
// three figures used to carry a forty-five-word note repeating rules 1 and 2
// and the two unit caveats, on every card and once per leg of a transaction.
// The rules did not go: they are bullets behind the info toggle
// (`alchemixReadingClauses`) and notes on each figure's own receipt, which is
// where a reader asks "where did this number come from". The heading names the
// block and stops.
//
// EARMARKED IS SHOWN, AND ONLY BECAUSE THE HEADING NAMES THE BLOCK. Decision
// 0032 point 6 permits stating it as of the block it was read at and forbids
// carrying it anywhere else. All three figures here come from one call at one
// block, and nothing on this card puts it beside a figure from another block. A
// ZERO KEEPS ITS CELL: the grid is a fixed triple a reader reads across cards,
// and by rule 3 an absent cell already means "not stated", so dropping a
// measured zero would make the two look alike.

import type { AlchemixStateAtBlockFromReading } from "@/lib/shared/types/event-shape";
import {
  ChainTruthDetail,
  type ChainTruthStat,
  type ChainTruthTransition,
} from "@/components/shared/chain-truth-event";
import { formatUnitsExact } from "@/lib/utils/format";
import { OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import { readingChangeProv, stateAtBlockFromReadingProv, type AlchemixCoords } from "@/lib/alchemix/event-provenance";
import type { AlchemixReading } from "@/lib/alchemix/readings-before";

const block = (n: number) => n.toLocaleString("en-US");

/** Both alAssets and the MYT share count carry 18 decimals, the same scale the
 *  rest of this card reads its emitted amounts at. */
const DECIMALS = 18;

/** The grid's figure: whole units from a thousand up, so a small move on a
 *  large balance still shows between before and after (Liquity V2's
 *  `36,887 → 35,899`); two places below that. */
const gridFigure = (raw: string): string => {
  const n = Number(raw) / 10 ** DECIMALS;
  if (n === 0) return "0";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(n) < 0.01) return "<0.01";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
};

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
  /** How many of this position's logs the card draws. One is a lone event;
   *  above one the card is a whole transaction, and rule 2's heading reads
   *  against this number. */
  legCount: number;
  coords: AlchemixCoords;
  /** The reading at the previous reading block on the timeline
   *  (lib/alchemix/readings-before), for before → after. Null draws the
   *  after-figures alone. */
  before?: AlchemixReading | null;
}

export function AlchemixStateAtBlock({
  state,
  syntheticSymbol,
  mytSymbol,
  eventBlock,
  legCount,
  coords,
  before = null,
}: AlchemixStateAtBlockProps) {
  // Absent on Transmuter rows, which have neither axis.
  if (!state) return null;

  const subject = legCount > 1 ? "This transaction" : "This event";

  if (state.status !== "stated" || state.blockNumber == null) {
    const at = eventBlock != null ? ` at block ${block(eventBlock)}` : "";
    const why =
      state.reason === "reading-stale"
        ? `The reading${at} did not complete, so what this position held here is not stated.`
        : `No reading was taken${at}: ${subject.toLowerCase()} moved neither debt nor collateral, so the explorer stores no figures for this block.`;
    return (
      <p className="mt-1 border-t border-rb-200 px-5 pb-3 pt-2 text-[11px] leading-relaxed text-rb-500 dark:border-rb-800">
        {why}
      </p>
    );
  }

  const atBlock = state.blockNumber;
  // Rule 2. Above the card's own leg count the reading covers events this card
  // does not draw, and the heading has to count the block's instead.
  const beyondCard = state.positionEventsInBlock > legCount;

  /** Before → after on one axis, from the reading before this block. None
   *  where there is no earlier reading or the axis did not move. */
  const transition = (label: string, symbol: string, raw: string, beforeRaw: string | null | undefined) => {
    if (!before || beforeRaw == null) return undefined;
    const delta = BigInt(raw) - BigInt(beforeRaw);
    // One wei either way is getCDP's rounding, not a move.
    if (delta >= BigInt(-1) && delta <= BigInt(1)) return undefined;
    const sign = delta > BigInt(0) ? "+" : "−";
    const abs = (delta < BigInt(0) ? -delta : delta).toString();
    const t: ChainTruthTransition = {
      before: gridFigure(beforeRaw),
      beforeExact: formatUnitsExact(beforeRaw, DECIMALS),
      beforeProv: stateAtBlockFromReadingProv(label, symbol, beforeRaw, before.blockNumber, 0, coords, DECIMALS),
      change: `${sign}${gridFigure(abs)}`,
      changeExact: `${sign}${formatUnitsExact(abs, DECIMALS)}`,
      changeProv: readingChangeProv(label, symbol, before.blockNumber, atBlock, coords),
    };
    return t;
  };

  const axis = (
    label: string,
    raw: string | null,
    symbol: string,
    beforeRaw: string | null | undefined,
  ): ChainTruthStat | null => {
    if (raw == null) return null;
    return {
      label,
      value: formatUnitsExact(raw, DECIMALS),
      symbol,
      display: gridFigure(raw),
      prov: stateAtBlockFromReadingProv(label, symbol, raw, atBlock, state.positionEventsInBlock, coords, DECIMALS),
      transition: transition(label, symbol, raw, beforeRaw),
    };
  };

  const stats = [
    axis("Debt", state.debtRaw, syntheticSymbol, before?.debtRaw),
    axis("Collateral", state.collateralRaw, mytSymbol, before?.collateralRaw),
    axis("Set aside for repayment", state.earmarkedRaw, syntheticSymbol, before?.earmarkedRaw),
  ].filter((s): s is ChainTruthStat => s != null);

  if (stats.length === 0) return null;

  const subjectWord = beyondCard
    ? `this block’s ${state.positionEventsInBlock} events`
    : legCount > 1
      ? "this transaction"
      : "this event";
  const heading = before ? `Before and after ${subjectWord}` : `After ${subjectWord}`;

  return (
    <div className="mt-1 border-t border-rb-200 pt-2 pb-3 dark:border-rb-800">
      <h4 className={`${OVERLAY_HEADING} px-5 text-rb-500`}>
        {heading} · block {block(atBlock)}
      </h4>
      <ChainTruthDetail stats={stats} symbolText />
    </div>
  );
}
