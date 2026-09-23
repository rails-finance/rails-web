// Receipts for an Aave V4 market note — the oracle price of ONE asset at two
// of a spoke position's rows, and what that move alone did to the health
// factor of the whole basket the earlier row recorded.
// ----------------------------------------------------------------------------
// Shaped after lib/liquity/market-note-provenance.ts, and it asks the same
// unusual question: two of the figures HAPPENED (the price at each of two rows
// the position is in), and two WOULD have been true (the health factor those
// two prices make of one recorded basket). The chain was never asked what this
// position's health factor was between those rows, because nothing asked it
// to act. Each receipt says which of the two it is.
//
// TWO THINGS ARE NOT READ AT THE EARLIER BLOCK, and both are named rather than
// smoothed over:
//
//   THE LIQUIDATION THRESHOLD. The threshold in force on a position is the
//   EFFECTIVE collateral factor, which an e-mode or correlated venue lifts
//   above the reserve's static getDynamicReserveConfig.collateralFactor, so the
//   backend harvests it from getUserAccountData.avgCollateralFactor at HEAD.
//   So the two health figures are the amounts and prices recorded at the
//   earlier row, read against the threshold the spoke reports NOW. The
//   threshold in force at that past block is on no record, and no receipt here
//   claims it is.
//
//   THE OTHER ASSETS' PRICES ARE FROZEN AT THE EARLIER BLOCK. A note is about
//   one asset. The rest of the basket keeps the prices in force at the earlier
//   row — the row's snapshot on a historical note, the pinned oracle read on
//   a live one — so `hfAfter` isolates this asset's move rather than restating
//   the position.
//
// Nothing is fetched for a historical note: every figure is a field of two rows
// the /api/aave-v4/timeline route already served to this page, and the reader
// can open both cards and read them there.
//
// A LIVE note is the other way round: BOTH of its prices are reads the page
// makes of one route, /api/oracle/aave-v4 — one Multicall3 over the oracle
// registry, which for every asset a V4 spoke lists is that spoke's AaveOracle
// answering `getReservePrice(reserveId)` (DAI, rETH and cbETH, listed by no V4
// spoke, keep Chainlink feeds). The later end reads it at head, dated against
// /api/head (two calls that can land a block apart); the earlier end reads it
// PINNED to the block of the row the note runs from, an archive read of the
// same oracle and immutable at that block. So a live note's earlier receipt
// names a read, not a row's field: the row supplies the moment, never the
// price.
//
// Since server migration 314 (2026-09-22) the STORED history is the same
// figure: every Aave V4 price row for a listed asset is the oracle's answer at
// that block, source `iaave-oracle` (rails-ops reference/pricing.md, "Aave
// V4"). A historical note's two readings and a live note's two reads therefore
// describe one source, and the copy here says "Aave's oracle" for both.

import type { Provenance } from "@/components/shared/provenance";
import type { MarketNotePoint, PriceGapNote } from "@/lib/shared/market-note";
import {
  AAVE_V4_LIQUIDATION_HF,
  aaveV4EndLabel,
  formatHealthFactor,
  formatPrice,
  healthDecimals,
  priceDecimals,
  priceGapReason,
} from "@/lib/shared/market-note";

/** How the price on an indexed Aave V4 row is arrived at — the same figure the
 *  event card's USD chip states at that block. Since server migration 314 this
 *  is the oracle's answer, not a Chainlink round read beside it. */
const DERIVATION =
  "the price Aave's oracle answered for this asset at that block — what the spoke valued the position at — stored " +
  "per (asset, block) and served on the row's snapshot (GET /api/aave-v4/timeline → " +
  "context.data.allSupplies[].price.usd, or a liquidation row's collateralPrice / debtPrice)";

/** How a LIVE end (`note.to` on a note with `live: true`) is arrived at: not a
 *  log at all, but a live read of Aave's oracle, dated against a separate
 *  chain-head read — the two calls can land a block apart, which is why the
 *  receipt states them as two reads rather than one atomic observation. */
const LIVE_DERIVATION =
  "a live read of Aave's oracle (GET /api/oracle/aave-v4), dated against the head block (GET /api/head) at read " +
  "time — the two calls can land a block apart";

/** How a live note's EARLIER end is arrived at: the same oracle read, pinned to
 *  the block of the row the note runs from. `getReservePrice` answers as of any
 *  block against an archive node, so this is what the oracle said then —
 *  immutable, and independent of whether the price lane covered that row. */
const PINNED_DERIVATION = (block: number) =>
  `the same oracle read at block ${block} (GET /api/oracle/aave-v4?block=${block}) — an archive read of the oracle, ` +
  `immutable at that block and independent of any stored row`;

const shortHex = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** One end of the gap in prose: which of the position's rows it is, and
 *  where the log sits. */
const endClause = (p: MarketNotePoint): string =>
  `this position's ${aaveV4EndLabel(p)} at block ${p.block} (${shortHex(p.txHash)}, log ${p.logIndex})`;

/** The live end in prose: no log to name, so the receipt names the read and the
 *  block it is stated against instead. */
const liveEndClause = (p: MarketNotePoint): string => `the oracle read at the chain head, block ${p.block}`;

/** A live note's earlier end in prose: the read, and the row whose block it is
 *  pinned to — in that order, because the price is the read's and the row only
 *  fixes the block. */
const pinnedEndClause = (p: MarketNotePoint): string =>
  `the oracle read at block ${p.block}, the block of this position's ${aaveV4EndLabel(p)} (${shortHex(p.txHash)}, log ${p.logIndex})`;

/** One end's price as a receipt leaf. On a LIVE note both ends are chain reads
 *  of the same oracle — head for the later, block-pinned for the earlier — so
 *  both are `chain`; on a historical note both are fields of the two rows. */
const priceLeaf = (note: PriceGapNote, p: MarketNotePoint, which: "earlier" | "later", live = false) => ({
  label: `price ${which}`,
  value: formatPrice(p.value, priceDecimals(note)),
  kind: live ? ("chain" as const) : ("chain-derived" as const),
  pclass: "oracle" as const,
  note: live
    ? which === "later"
      ? `${liveEndClause(p)} — ${LIVE_DERIVATION}`
      : `${pinnedEndClause(p)} — ${PINNED_DERIVATION(p.block)}`
    : `${endClause(p)} — ${DERIVATION}`,
  ...(note.marketAddress ? { contract: { name: `${note.marketSymbol} reserve`, address: note.marketAddress } } : {}),
});

/** The underlying token the price is quoted for, where the note knows its
 *  address (the chain overlay's `reserves[].address`). A note built without an
 *  overlay states no contract rather than naming the wrong one. */
const reserveContract = (note: PriceGapNote) =>
  note.marketAddress ? { contract: { name: `${note.marketSymbol} (underlying)`, address: note.marketAddress } } : {};

/**
 * The gap itself: the two prices, the change between them, or the two blocks
 * they were read at. One builder, four faces, because the row states one fact
 * in several places and a reader who opens any of them should land on the same
 * two rows.
 */
export const aaveV4PriceGapProv = (note: PriceGapNote, part: "price" | "change" | "blocks" | "elapsed"): Provenance => {
  if (part === "elapsed") return elapsedProv(note);
  const pair = `${note.marketSymbol} oracle price`;
  const summary = note.live
    ? part === "price"
      ? `The ${pair} at each end of the stretch — both read from Aave's oracle, the earlier one ${PINNED_DERIVATION(note.from.block)}, the later one ${LIVE_DERIVATION}. The row fixes the block the earlier read is pinned to. Nothing is drawn between the two: the position transacted nothing across the stretch.`
      : part === "change"
        ? `How far the ${pair} has moved since this position's newest row holding ${note.marketSymbol} against debt — the oracle at that row's block against the oracle now. Only this price moves: every amount, and every other asset's price, stands as it was at that block.`
        : `The block the stretch runs from, and the head block it runs to — this position's newest row holding ${note.marketSymbol} against debt, and the block the oracle answered at. The position transacted in no later block; the head is the latest block the price can be read against.`
    : part === "price"
      ? `The ${pair} at each end of the stretch — ${DERIVATION}, taken at the two rows of this position that bracket it. Both stand fixed at their blocks, and each is the figure the event card at that block states. Nothing is drawn between the two: the position transacted nothing across the stretch.`
      : part === "change"
        ? `How far the ${pair} moved across the stretch — the later reading against the earlier one. Only this price moves: every amount, and every other asset's price, stands as the row recorded it at the earlier block.`
        : `The two blocks the stretch runs between — the blocks of the two rows the readings come from. The position was in a transaction at each, which is how the price is known there, and nothing is claimed about the path in between.`;
  const value =
    part === "price"
      ? `${formatPrice(note.from.value, priceDecimals(note))} → ${formatPrice(note.to.value, priceDecimals(note))}`
      : part === "change"
        ? String(note.changePct)
        : `${note.from.block} → ${note.to.block}`;
  return {
    kind: note.live && part === "price" ? "chain" : "chain-derived",
    pclass: "oracle",
    summary,
    ...reserveContract(note),
    via: note.live
      ? `GET /api/oracle/aave-v4 · getReservePrice at block ${note.from.block} · getReservePrice at read time`
      : "the two rows' snapshot prices · Aave's oracle at each block",
    ...(part === "change" ? { formula: "later price ÷ earlier price − 1" } : {}),
    verify: {
      kind: "recompute",
      text: note.live
        ? `Re-read GET /api/oracle/aave-v4?block=${note.from.block} for the earlier figure here (value ${value}): a past block's answer cannot change, so it repeats digit for digit, and so does a getReservePrice call on the spoke's AaveOracle at that block against any archive node. That block is ${endClause(note.from)}. Re-read GET /api/oracle/aave-v4 and GET /api/head to reproduce the later one and its block; both move, so a repeat of the same figure is not expected. The stretch is stated because ${priceGapReason(note)}.`
        : `Open the two rows on this page — ${endClause(note.from)} and ${endClause(note.to)} — and read the ${note.marketSymbol} price each card states; they are the two figures here (value ${value}). Aave's oracle answers the same numbers at those blocks against an archive node. The stretch is stated because ${priceGapReason(note)}.`,
    },
    inputs: [
      priceLeaf(note, note.from, "earlier", note.live),
      priceLeaf(note, note.to, "later", note.live),
      {
        label: "blocks",
        value: `${note.from.block} → ${note.to.block}`,
        kind: "chain",
        pclass: "emitted",
        note: note.live
          ? `the block the earlier read is pinned to (${note.from.block}), this position's newest row holding the asset against debt, and the block the oracle answered at (${note.to.block})`
          : `the two rows' block numbers — ${note.from.block} and ${note.to.block}`,
      },
    ],
  };
};

/**
 * What the move meant for this position: the health factor the earlier row's
 * whole basket made at each end's price, and the 1.00 it is read against.
 *
 * `hfAfter` is the one figure here the chain never stated. It holds every
 * amount and every other asset's price fixed and moves only this asset's,
 * which is what makes it comparable to `hfBefore` — and it is why the sentence
 * says "at the amounts recorded at block N" rather than implying a second
 * reading. Interest kept accruing across the stretch, so the position's real
 * health factor at the later block differed from this.
 */
export const aaveV4PriceGapHealthProv = (
  note: PriceGapNote,
  part: "hfBefore" | "hfAfter" | "minimum" | "state",
): Provenance => {
  const h = note.health;
  const end = part === "hfAfter" ? note.to : note.from;
  // On a LIVE note every leg is valued at the oracle's prices at the earlier
  // row's block, not at the prices the row states — the same pinned read the
  // earlier price comes from. The amounts are always the row's.
  const priceSource = note.live
    ? `the oracle's prices at that block (GET /api/oracle/aave-v4?block=${h?.atBlock})`
    : "the prices that row recorded";
  const basketLeaves = [
    {
      label: "collateral (LT-weighted)",
      value: h ? String(h.collateralUsd) : undefined,
      kind: "chain-derived" as const,
      pclass: "indexed" as const,
      note: `Σ(amount × price × liquidation threshold) over every supply the row at block ${h?.atBlock} recorded, at ${priceSource}`,
    },
    {
      label: "debt",
      value: h ? String(h.debtUsd) : undefined,
      kind: "chain-derived" as const,
      pclass: "indexed" as const,
      note: `Σ(amount × price) over every debt that same row recorded at block ${h?.atBlock}, at ${priceSource}`,
    },
    {
      label: "liquidation threshold",
      value: "reserves[].lt at head",
      kind: "chain" as const,
      pclass: "state" as const,
      note: "the threshold the spoke reports now (GET /api/chain/aave-v4/spoke-position → reserves[].lt, the collateral factor getUserAccountData returns for a position holding the asset alone) — the one in force at the earlier block is nowhere on record",
    },
  ];
  const summary =
    part === "minimum"
      ? `Aave's liquidation trigger — a spoke position becomes liquidatable at a health factor of ${AAVE_V4_LIQUIDATION_HF}. It is a protocol constant, the figure every liquidation on this spoke is enforced against, and it does not vary by position.`
      : part === "state"
        ? `The block the basket comes from — the earlier of the two rows, the last one before the later price at which this position's snapshot states every amount and every price. Nothing is read at a block between the two, since the position transacted in none of them.`
        : part === "hfBefore"
          ? `This position's health factor at the earlier row — the collateral the row recorded at block ${h?.atBlock}, each asset weighted by its liquidation threshold, over the debt on that same row, at ${priceSource}. The basket as it stood, against the threshold the spoke reports now.`
          : note.live
            ? `The same basket at the live price — what the health factor at block ${h?.atBlock} comes to now that the ${note.marketSymbol} price reads ${formatPrice(note.to.value, priceDecimals(note))}. The chain was never asked this: the position has done nothing since that row, so nothing recorded it. Only this one asset's price moves; every other amount is the row's and every other price is the oracle's at that block, and interest has accrued since.`
            : `The same basket at the later price — what the health factor recorded at block ${h?.atBlock} came to be worth once the ${note.marketSymbol} price was ${formatPrice(note.to.value, priceDecimals(note))}. The chain was never asked this: the position did nothing between the two rows, so nothing recorded it. Only this one asset's price moves between the two figures; every other amount and price is the earlier row's, and interest accrued across the stretch.`;
  const derived = part === "hfBefore" || part === "hfAfter";
  return {
    kind: derived ? "chain-derived" : "chain",
    pclass: part === "minimum" ? "state" : derived ? "indexed" : "emitted",
    summary,
    ...(part === "minimum" ? {} : reserveContract(note)),
    ...(derived
      ? {
          // A custody lead (the lane) so the embedded receipt's first-segment
          // drop takes it and both origin segments survive.
          via: note.live
            ? `GET /api/aave-v4/timeline · the earlier row's recorded amounts · getReservePrice at block ${h?.atBlock} for every leg, with only this asset's price moved`
            : "the earlier row's recorded amounts and prices, with only this asset's price moved",
          formula: "Σ(collateral × price × LT) ÷ Σ(debt × price)",
        }
      : {}),
    verify: {
      kind: "recompute",
      text:
        part === "minimum"
          ? `A spoke liquidates a position the moment its health factor reaches ${AAVE_V4_LIQUIDATION_HF} — read getUserAccountData on the spoke for any position and compare its healthFactor against its liquidation record.`
          : part === "state"
            ? `Open this position's row at block ${h?.atBlock} on this page: the supplies and debts its snapshot states${note.live ? `, valued at the prices GET /api/oracle/aave-v4?block=${h?.atBlock} answers` : " and the prices with them"}, are what both health figures are built from.`
            : `Take every supply and debt the row at block ${h?.atBlock} states on its card, value them at ${note.live ? `the prices GET /api/oracle/aave-v4?block=${h?.atBlock} answers` : "that row's prices"} with ${formatPrice(end.value, priceDecimals(note))} for ${note.marketSymbol}, weight each supply by the threshold the spoke reports now, and divide. The result is ${h ? formatHealthFactor(part === "hfAfter" ? h.hfAfter : h.hfBefore, healthDecimals(h)) : "—"}. The stretch is stated because ${priceGapReason(note)}.`,
    },
    inputs:
      part === "minimum"
        ? [
            {
              label: "liquidation health factor",
              value: AAVE_V4_LIQUIDATION_HF,
              kind: "chain",
              pclass: "state",
              note: "the protocol's trigger",
            },
          ]
        : part === "state"
          ? basketLeaves
          : [...basketLeaves, priceLeaf(note, end, part === "hfAfter" ? "later" : "earlier", !!note.live)],
  };
};

/**
 * The time between the two ends: the difference of the two blocks'
 * timestamps, each the header of the block the row sits in. Exact — not a block
 * count times an assumed block time — and silent about where inside the stretch
 * the price moved.
 */
const elapsedProv = (note: PriceGapNote): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  summary: note.live
    ? `The time since the earlier row — the chain head's timestamp (GET /api/head, at read time) less the header of the block the row this note runs from sits in. It is the difference of two block timestamps, and it grows on every reload.`
    : `The time between the two rows — the later block's timestamp less the earlier's, each read from the header of the block that row sits in. It is the difference of two block timestamps, and the price moved somewhere inside it.`,
  ...reserveContract(note),
  via: note.live
    ? "GET /api/head · the head block's timestamp less the header of the earlier row's block"
    : "the header of each of the two rows' blocks",
  formula: "timestamp after − timestamp before",
  verify: {
    kind: "recompute",
    text: note.live
      ? `Open this position's row at block ${note.from.block} on this page for its timestamp, and re-read GET /api/head for the chain head's; subtract the two.`
      : `Open each block on the chain's explorer — ${note.from.block} and ${note.to.block} — and subtract the two timestamps; or read the two rows' dates on this page.`,
  },
  inputs: [
    {
      label: "timestamps",
      value: `${note.from.timestamp} → ${note.to.timestamp}`,
      kind: "chain",
      pclass: "emitted",
      note: `Unix seconds of blocks ${note.from.block} and ${note.to.block}`,
    },
  ],
});
