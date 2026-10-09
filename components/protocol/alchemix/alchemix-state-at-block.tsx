"use client";

// Where the position stood at one transaction's block: the served `getCDP`
// reading, as the event card's cells (ui-jobs 309).
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
//    cells' tip is where it shows: at or below the card's leg count the
//    reading covers what the card draws and nothing else, so the tip names
//    the transaction (or the lone event); above it the block holds events this
//    card does not draw, and the tip counts the block's instead.
//
// 3. AN ABSENT READING IS NOT A ZERO. A custody Transfer moves neither axis, so
//    it is not a block the sweep stops at: 1,867 of production's 4,988 position
//    Transfers have no reading. Those draw debt and collateral from the reading
//    in force at that block, muted as unchanged, and never set-aside, which
//    grows every block (decisions/0032 point 6); with no earlier reading on the
//    timeline they draw one sentence. A measured
//    zero draws the grid with "0" in it via the grid's own `formatCompact`,
//    never through `fmtHeaderMagnitude` (which now states a genuine zero as
//    "0" too, fixed under rails-ops TO-DO-ui-jobs item 74).
//
// WHAT THE CARD FACE SAYS ABOUT ALL THAT IS THE BLOCK, AND NOTHING ELSE. The
// three figures used to carry a forty-five-word note repeating rules 1 and 2
// and the two unit caveats, on every card and once per leg of a transaction.
// The rules did not go: they are bullets behind the info toggle
// (`alchemixReadingClauses`) and notes on each figure's own receipt, which is
// where a reader asks "where did this number come from". Each cell's tip names
// the block and stops.
//
// EARMARKED IS SHOWN, AND ONLY BECAUSE THE TIP NAMES THE BLOCK. Decision
// 0032 point 6 permits stating it as of the block it was read at and forbids
// carrying it anywhere else. All three figures here come from one call at one
// block, and nothing on this card puts it beside a figure from another block. A
// ZERO KEEPS ITS CELL: the grid is a fixed triple a reader reads across cards,
// and by rule 3 an absent cell already means "not stated", so dropping a
// measured zero would make the two look alike.

import type { ReactNode } from "react";
import type { AlchemixStateAtBlockFromReading } from "@/lib/shared/types/event-shape";
import { type ChainTruthStat, type ChainTruthTransition } from "@/components/shared/chain-truth-event";
import type { EventCellSpec, EventCells } from "@/components/shared/event-cells";
import { useStatCells } from "@/components/shared/chain-truth-cells";
import { formatTinyNonZero, formatUnitsExact } from "@/lib/utils/format";
import {
  carriedReadingProv,
  lineRatioProv,
  readingChangeProv,
  readingCollateralisationProv,
  stateAtBlockFromReadingProv,
  type AlchemixCoords,
} from "@/lib/alchemix/event-provenance";
import {
  readingCollateralisationRaw,
  useAlchemixLineRatios,
  useAlchemixUnderlying,
  useReadingInForce,
  type AlchemixReading,
} from "@/lib/alchemix/readings-before";
import { Prov } from "@/components/shared/provenance";
import { BlockRef } from "@/components/shared/block-ref";

const block = (n: number) => n.toLocaleString("en-US");

/** A line under the card's grid. */
const NOTE = "px-5 pb-2 text-[11px] leading-relaxed text-rb-500";

/** Both alAssets and the MYT share count carry 18 decimals, the same scale the
 *  rest of this card reads its emitted amounts at. */
const DECIMALS = 18;

/** The grid's figure: whole units from a thousand up, so a small move on a
 *  large balance still shows between before and after (Liquity V2's
 *  `36,887 → 35,899`); two places down to 0.01, formatTinyNonZero below. */
const gridFigure = (raw: string): string => {
  const n = Number(raw) / 10 ** DECIMALS;
  if (n === 0) return "0";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(n) < 0.01) return formatTinyNonZero(n);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
};

/** Before and after in the grid's format, widened where the two would round
 *  alike although they differ (a 0.2-share repay fee on 55,258 shares): both
 *  take the fewest fixed decimals, two at least, that tell them apart. A pair
 *  that still matches at ten keeps the grid's figures. Alchemix-local; the
 *  shared grid formats each figure alone. */
function gridPair(beforeRaw: string, raw: string): { before: string; after: string } {
  const before = gridFigure(beforeRaw);
  const after = gridFigure(raw);
  if (before !== after || beforeRaw === raw) return { before, after };
  const b = Number(beforeRaw) / 10 ** DECIMALS;
  const a = Number(raw) / 10 ** DECIMALS;
  for (let d = 2; d <= 10; d++) {
    const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    if (fmt(b) !== fmt(a)) return { before: fmt(b), after: fmt(a) };
  }
  return { before, after };
}

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
   *  above one the card is a whole transaction, and rule 2's tip reads
   *  against this number. */
  legCount: number;
  coords: AlchemixCoords;
  /** The reading at the previous reading block on the timeline
   *  (lib/alchemix/readings-before), for before → after. Null draws the
   *  after-figures alone. */
  before?: AlchemixReading | null;
}

/** A 1e18-scaled ratio in the event grid: two places, Liquity's event grid,
 *  so a small move still shows between before and after. */
function gridRatio(raw: string): string {
  const pct = Number(raw) / 1e16;
  if (pct >= 10000) return "over 10,000%";
  return `${pct.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** A 1e18-scaled ratio as the position card draws it. */
function ratioPct(raw: string): string {
  const pct = Number(raw) / 1e16;
  if (pct >= 10000) return "over 10,000%";
  return pct < 1000
    ? `${pct.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    : `${Math.round(pct).toLocaleString("en-US")}%`;
}

/** The reading as the card's cells, and the line that stands under them where
 *  the block has no reading of its own. */
export interface AlchemixReadingCells {
  cells: EventCells;
  note: ReactNode;
}

export function useAlchemixReadingCells({
  state,
  syntheticSymbol,
  mytSymbol,
  eventBlock,
  legCount,
  coords,
  before = null,
}: AlchemixStateAtBlockProps): AlchemixReadingCells {
  const unit = useAlchemixUnderlying();
  const ratios = useAlchemixLineRatios();
  const toCells = useStatCells(true);
  // Rule 3's exception, for a block with no reading of its own: the reading in
  // force there, carried on debt and collateral only (lib/alchemix/readings-before).
  const inForce = useReadingInForce(state && state.status !== "stated" ? eventBlock : null);

  // Absent on Transmuter rows, which have neither axis.
  if (!state) return { cells: { none: "no reading on this row" }, note: null };

  if (state.status !== "stated" || state.blockNumber == null) {
    if (state.reason === "reading-stale") {
      const at = eventBlock != null ? ` at block ${block(eventBlock)}` : "";
      return {
        cells: { none: "the reading did not complete" },
        note: <p className={NOTE}>The reading{at} did not complete, so what this position held here is not stated.</p>,
      };
    }
    // A custody move: neither axis moved. The figures in force are shown
    // muted, the way an untouched axis is, and set-aside is left out because
    // it grows every block and a reading holds it at its own block alone.
    if (inForce && eventBlock != null && inForce.debtRaw != null && inForce.collateralRaw != null) {
      const carried = (label: string, raw: string, symbol: string): ChainTruthStat => ({
        label,
        value: formatUnitsExact(raw, DECIMALS),
        symbol,
        display: gridFigure(raw),
        changed: false,
        prov: carriedReadingProv(label, symbol, raw, inForce.blockNumber, eventBlock, coords),
      });
      const tip = `Unchanged by ${legCount > 1 ? "this transaction" : "this event"}: the reading at block ${block(inForce.blockNumber)}, the last before it`;
      return {
        cells: [
          ...toCells([
            { ...carried("Debt", inForce.debtRaw, syntheticSymbol), key: "debt" },
            { ...carried("Collateral", inForce.collateralRaw, mytSymbol), key: "collateral" },
          ]).map((c) => ({ ...c, tip })),
        ],
        note: null,
      };
    }
    return {
      cells: { none: "no reading at this block" },
      note: <p className={NOTE}>Debt and collateral did not change.</p>,
    };
  }

  const atBlock = state.blockNumber;
  // Rule 2. Above the card's own leg count the reading covers events this card
  // does not draw, and the tip has to count the block's instead.
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
      before: gridPair(beforeRaw, raw).before,
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
    const t = transition(label, symbol, raw, beforeRaw);
    return {
      label,
      value: formatUnitsExact(raw, DECIMALS),
      symbol,
      display: t && beforeRaw != null ? gridPair(beforeRaw, raw).after : gridFigure(raw),
      prov: stateAtBlockFromReadingProv(label, symbol, raw, atBlock, state.positionEventsInBlock, coords, DECIMALS),
      transition: t,
      // Colour shows change: an axis this block left where the reading before
      // had it is muted. With no reading before, the figure is new.
      changed: t != null || !before || beforeRaw == null,
    };
  };

  // Collateralisation at each reading, from its own share price. Where the
  // before reading gives none, the after stands alone.
  const underSym = unit?.symbol ?? "the asset underneath";
  const ratioAfter = readingCollateralisationRaw(
    { collateralRaw: state.collateralRaw, debtRaw: state.debtRaw, sharePriceRaw: state.sharePriceRaw ?? null },
    unit?.decimals ?? null,
  );
  const ratioBefore = before ? readingCollateralisationRaw(before, unit?.decimals ?? null) : null;
  const ratioStat: ChainTruthStat | null =
    ratioAfter != null && unit && state.collateralRaw != null && state.debtRaw != null && state.sharePriceRaw
      ? {
          label: "Collateralisation",
          value: String(Number(ratioAfter) / 1e16),
          symbol: "",
          display: gridRatio(ratioAfter),
          changed: ratioBefore == null || ratioBefore !== ratioAfter,
          prov: readingCollateralisationProv(
            state.collateralRaw,
            state.sharePriceRaw,
            state.debtRaw,
            atBlock,
            unit.decimals,
            mytSymbol,
            underSym,
            coords,
          ),
          transition:
            ratioBefore != null &&
            before &&
            before.collateralRaw != null &&
            before.debtRaw != null &&
            before.sharePriceRaw != null &&
            ratioBefore !== ratioAfter
              ? (() => {
                  const pts = (Number(ratioAfter) - Number(ratioBefore)) / 1e16;
                  const change = `${pts >= 0 ? "+" : "−"}${Math.abs(pts).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
                  return {
                    before: gridRatio(ratioBefore),
                    beforeExact: String(Number(ratioBefore) / 1e16),
                    beforeProv: readingCollateralisationProv(
                      before.collateralRaw!,
                      before.sharePriceRaw!,
                      before.debtRaw!,
                      before.blockNumber,
                      unit.decimals,
                      mytSymbol,
                      underSym,
                      coords,
                    ),
                    change,
                    changeExact: `${pts >= 0 ? "+" : "−"}${Math.abs(pts)}`,
                    changeProv: readingChangeProv("Collateralisation", "%", before.blockNumber, atBlock, coords),
                  } satisfies ChainTruthTransition;
                })()
              : undefined,
        }
      : null;

  const subjectWord = beyondCard
    ? `this block’s ${state.positionEventsInBlock} events`
    : legCount > 1
      ? "this transaction"
      : "this event";
  // Rule 2, in each cell's tip: the reading belongs to the block.
  const tip = `${before ? `Before and after ${subjectWord}` : `After ${subjectWord}`}: getCDP read at block ${block(atBlock)}${before ? ` and at block ${block(before.blockNumber)}` : ""}`;
  const cell = (s: ChainTruthStat | null, key: string, inputs?: string[]): EventCellSpec | null =>
    s ? { ...toCells([{ ...s, key, inputs }])[0], tip } : null;
  const ratioCell = cell(ratioStat, "ratio", ["debt", "collateral"]);
  if (ratioCell && ratios)
    ratioCell.sub = [
      ...(ratioCell.sub ?? []),
      {
        content: (
          <>
            minimum{" "}
            <Prov info={lineRatioProv("minimumCollateralization", ratios.minimumRaw, ratios.asOfBlock, coords)}>
              {ratioPct(ratios.minimumRaw)}
            </Prov>
            {" · "}liquidation at{" "}
            <Prov info={lineRatioProv("collateralizationLowerBound", ratios.lowerBoundRaw, ratios.asOfBlock, coords)}>
              {ratioPct(ratios.lowerBoundRaw)}
            </Prov>
            , read at <BlockRef block={ratios.asOfBlock} />
          </>
        ),
      },
    ];
  const cells = [
    cell(axis("Debt", state.debtRaw, syntheticSymbol, before?.debtRaw), "debt"),
    cell(axis("Collateral", state.collateralRaw, mytSymbol, before?.collateralRaw), "collateral"),
    cell(axis("Set aside for repayment", state.earmarkedRaw, syntheticSymbol, before?.earmarkedRaw), "set-aside"),
    ratioCell,
  ].filter((c): c is EventCellSpec => c != null);

  return { cells: cells.length > 0 ? cells : { none: "the reading states no figure" }, note: null };
}
