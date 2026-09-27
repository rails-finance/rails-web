// Alchemix V3 share-price market notes: the vault's share price at two of a
// position's readings, and what the move alone did to its collateral.
// ----------------------------------------------------------------------------
// The price-gap kind (lib/shared/market-note.ts), on a position whose
// collateral is a vault share count. The one price that moves an Alchemix
// position's collateral value, and so its distance to liquidation, is the
// MYT's share price: one share in the asset underneath. Every reading on the
// timeline stores it (`stateAtBlockFromReading.sharePriceRaw`) beside the
// debt and share count read at the same block, so a note is two fields of two
// rows already on the page and nothing is fetched.
//
// THE RULE IS THE SHARED ONE. A stretch between two consecutive readings is
// stated when the move used at least `RUNWAY_SHARE` of the position's runway
// to the line's liquidation line, measured at the earlier reading, or when it
// ends in a liquidation. A share price that rises slowly moves a few basis
// points between readings, so most stretches stay silent. A line redemption
// is held to the threshold like any other end: it is not priced, and a line
// with many of them would otherwise draw a note beside each.
//
// The live note is the shared live rule too: the newest reading against the
// share price the page reads with the position card's figures, drawn where
// the move clears `liveGapStatesAChange`.
//
// The liquidation line is the Alchemist's `collateralizationLowerBound` as
// the position card reads it now. The value in force at a past block is not
// indexed, and the receipt says so.

import type { AlchemistEvent } from "@/lib/alchemix/explainer-clauses";
import { liveGapStatesAChange, RUNWAY_SHARE, type MarketNotePoint, type PriceGapNote } from "@/lib/shared/market-note";

/** The line a set of notes is read in. */
export interface AlchemixSharePriceLine {
  lineKey: string;
  mytSymbol: string;
  /** The MYT vault, for the receipt's contract line. Empty where unknown. */
  mytAddress: string;
  underlyingSymbol: string;
  /** The line's synthetic, the debt's denomination ("alUSD"). */
  syntheticSymbol?: string;
  underlyingDecimals: number;
  /** `collateralizationLowerBound` as a multiplier (1.0526…), read now. */
  liquidationLine: number;
}

interface Reading {
  event: AlchemistEvent;
  block: number;
  price: number;
  debt: number;
  shares: number;
}

/** An Alchemix event id is `${txHash}:${logIndex}`. */
function logIndexOf(e: AlchemistEvent): number {
  const cut = e.id.lastIndexOf(":");
  const n = cut < 0 ? NaN : Number(e.id.slice(cut + 1));
  return Number.isFinite(n) ? n : -1;
}

/** One reading per block, the block's first event in chain order carrying it,
 *  oldest first. A row whose reading is unavailable or carries no share price
 *  is not an observation. */
function readings(events: readonly AlchemistEvent[], decimals: number): Reading[] {
  const sorted = [...events].sort((a, b) => a.blockNumber - b.blockNumber || logIndexOf(a) - logIndexOf(b));
  const out: Reading[] = [];
  for (const e of sorted) {
    const s = e.context.data.stateAtBlockFromReading;
    if (s?.status !== "stated" || s.blockNumber == null || !s.sharePriceRaw) continue;
    if (s.debtRaw == null || s.collateralRaw == null) continue;
    const price = Number(s.sharePriceRaw) / 10 ** decimals;
    if (!(price > 0)) continue;
    if (out.length > 0 && out[out.length - 1].block === s.blockNumber) continue;
    out.push({
      event: e,
      block: s.blockNumber,
      price,
      debt: Number(s.debtRaw) / 1e18,
      shares: Number(s.collateralRaw) / 1e18,
    });
  }
  return out;
}

function point(r: Reading): MarketNotePoint {
  return {
    block: r.block,
    timestamp: r.event.timestamp,
    value: r.price,
    eventId: r.event.id,
    txHash: r.event.txHash.toLowerCase(),
    logIndex: logIndexOf(r.event),
    wallet: (r.event.wallet ?? "").toLowerCase(),
    kind: r.event.context.data.eventType,
  };
}

/** The position's state at the earlier reading, valued at two share prices. */
function gap(line: AlchemixSharePriceLine, a: Reading, toPrice: number) {
  const crBefore = ((a.shares * a.price) / a.debt) * 100;
  const crAfter = (crBefore * toPrice) / a.price;
  const runway = 1 - line.liquidationLine / (crBefore / 100);
  const move = Math.abs(toPrice / a.price - 1);
  const consumed = runway > 0 ? move / runway : Infinity;
  // The same rounding the Liquity V2 selector applies to its branch minimum.
  const mcrPct = Math.round(line.liquidationLine * 100_000) / 1000;
  return {
    move,
    consumed,
    runway,
    changePct: (toPrice / a.price - 1) * 100,
    position: {
      crBefore,
      crAfter,
      mcrPct,
      debt: a.debt,
      coll: a.shares,
      atBlock: a.block,
      valueSymbol: line.underlyingSymbol,
      ...(line.syntheticSymbol ? { debtSymbol: line.syntheticSymbol } : {}),
    },
  };
}

function base(line: AlchemixSharePriceLine) {
  return {
    kind: "price-gap" as const,
    protocol: "alchemix-v3",
    marketSymbol: line.mytSymbol,
    marketAddress: line.mytAddress,
    unitLabel: `${line.underlyingSymbol} per ${line.mytSymbol}`,
  };
}

/** The stretches between two consecutive readings where the share price moved
 *  enough to matter to this position. */
export function alchemixSharePriceNotes(
  events: readonly AlchemistEvent[],
  line: AlchemixSharePriceLine,
): PriceGapNote[] {
  const rs = readings(events, line.underlyingDecimals);
  const out: PriceGapNote[] = [];
  for (let i = 0; i < rs.length - 1; i++) {
    const a = rs[i];
    const b = rs[i + 1];
    if (a.price === b.price) continue;
    // No debt is no runway, and no shares is nothing to value.
    if (!(a.debt > 0) || !(a.shares > 0)) continue;
    const g = gap(line, a, b.price);
    const endedBy: PriceGapNote["endedBy"] =
      b.event.context.data.eventType === "liquidated" ? "liquidation" : "adjustment";
    if (endedBy === "adjustment" && !(g.consumed >= RUNWAY_SHARE)) continue;
    out.push({
      ...base(line),
      id: `share-price:${line.lineKey}:${a.block}-${b.block}`,
      from: point(a),
      to: point(b),
      changePct: g.changePct,
      consumed: g.consumed,
      runway: g.runway,
      endedBy,
      position: g.position,
    });
  }
  return out;
}

/** The newest reading against the share price read now. */
export function liveAlchemixSharePriceNote(
  events: readonly AlchemistEvent[],
  line: AlchemixSharePriceLine,
  live: { price: number; block: number },
): PriceGapNote | null {
  if (!(live.price > 0)) return null;
  const rs = readings(events, line.underlyingDecimals);
  const a = rs[rs.length - 1];
  if (!a || !(a.debt > 0) || !(a.shares > 0) || live.block <= a.block) return null;
  const g = gap(line, a, live.price);
  if (!liveGapStatesAChange(g.move, g.consumed)) return null;
  return {
    ...base(line),
    id: `share-price:${line.lineKey}:${a.block}-head`,
    from: point(a),
    to: { block: live.block, timestamp: 0, value: live.price, txHash: "", logIndex: -1, wallet: "", kind: "head" },
    changePct: g.changePct,
    consumed: g.consumed,
    runway: g.runway,
    endedBy: "head",
    position: g.position,
    live: true,
  };
}
