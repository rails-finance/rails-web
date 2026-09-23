// Receipts for a Liquity V2 market note — the price gap between two of a
// trove's events, and what it did to the trove's collateral ratio.
//
// Two of the figures are prices at the blocks of two of the trove's events;
// the other two are ratios worked out from the earlier event's logged debt and
// collateral at each of those prices. The later ratio holds that debt and
// collateral fixed, and its receipt says so.
//
// Nothing here is fetched: every Liquity V2 row carries `collateralPrice`, the
// figure the event card's price pill shows (`eventPriceProv` in
// lib/liquity/event-provenance.ts is that pill's receipt), so a price gap is
// two fields of two rows on the page.
//
// Shaped after lib/moonwell/market-note-provenance.ts.

import type { Provenance } from "@/components/shared/provenance";
import type { MarketNotePoint, PriceGapNote } from "@/lib/shared/market-note";
import { formatPrice, priceDecimals, priceGapEndLabel, priceGapReason } from "@/lib/shared/market-note";

/** How the oracle price on a Liquity V2 row is arrived at — the wording
 *  `eventPriceProv` uses for the same number on the event card itself. */
const DERIVATION =
  "the price Liquity used at that block, from Chainlink's on-chain price feeds (and, for staked ETH, the token's " +
  "exchange rate) combined by the rules in Liquity's PriceFeed contract";

/** How a LIVE end (`note.to` on a note with `live: true`) is arrived at: the
 *  same feeds and rules, read at the latest block. The price and the block
 *  number that dates it are two reads, so they can land a block apart. */
const LIVE_DERIVATION =
  "the same feeds and rules read at the latest block; the price and the block number are read separately " +
  "and can be one block apart";

const shortHex = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** One end of the gap in prose: which of the trove's own events it is, and
 *  where the log sits. */
const endClause = (p: MarketNotePoint): string =>
  `this trove's ${priceGapEndLabel(p)} at block ${p.block} (${shortHex(p.txHash)}, log ${p.logIndex})`;

/** The live end in prose: no log to name, so the receipt names the read and
 *  the block it is stated against instead. */
const liveEndClause = (p: MarketNotePoint): string => `the latest block when this page loaded, ${p.block}`;

/** `decimals` is the note's own grain (`priceDecimals`), so a receipt states
 *  its end exactly as the stat card beside it does. */
const priceLeaf = (p: MarketNotePoint, which: "earlier" | "later", decimals: number, live = false) => ({
  label: `price ${which}`,
  value: formatPrice(p.value, decimals),
  kind: "chain-derived" as const,
  pclass: "oracle" as const,
  note: live ? `${liveEndClause(p)} — ${LIVE_DERIVATION}` : `${endClause(p)} — ${DERIVATION}`,
});

/** The branch's PriceFeed, where the note knows it. A note built without one
 *  states no contract rather than naming the wrong address. */
const feed = (note: PriceGapNote) =>
  note.marketAddress ? { contract: { name: `${note.marketSymbol} PriceFeed`, address: note.marketAddress } } : {};

/**
 * The gap itself: the two prices, the change between them, or the two blocks
 * they were read at. One builder, three faces, because the sentence states one
 * fact in three places and a reader who opens any of them should land on the
 * same two logs.
 */
export const priceGapProv = (note: PriceGapNote, part: "price" | "change" | "blocks" | "elapsed"): Provenance => {
  const pair = `${note.marketSymbol} oracle price`;
  if (part === "elapsed") return elapsedProv(note);
  const summary = note.live
    ? part === "price"
      ? `The ${pair} at each end of the stretch — the earlier one is Liquity's ${note.marketSymbol} price at the block of this trove's last event that has a price. The later one is Liquity's price at the latest block.`
      : part === "change"
        ? `How far the ${pair} has moved since this trove's last event that has a price — the current price divided by the price at that event, minus one.`
        : `The block the stretch runs from and the block it runs to — the block of this trove's last event that has a price, and the latest block on the chain when this page loaded.`
    : part === "price"
      ? `The ${pair} at each end of the stretch — Liquity's ${note.marketSymbol} price at the blocks of the two events of this trove that the stretch runs between.`
      : part === "change"
        ? `How far the ${pair} moved across the stretch — the later price divided by the earlier price, minus one.`
        : `The two blocks the stretch runs between — the blocks of the two events of this trove that the prices come from.`;
  const value =
    part === "price"
      ? `${formatPrice(note.from.value, priceDecimals(note))} → ${formatPrice(note.to.value, priceDecimals(note))}`
      : part === "change"
        ? String(note.changePct)
        : `${note.from.block} → ${note.to.block}`;
  return {
    kind: "chain-derived",
    pclass: "oracle",
    summary,
    ...feed(note),
    via: note.live
      ? "Chainlink feeds combined by Liquity PriceFeed rules @ the earlier event's block and the latest block"
      : "Chainlink feeds combined by Liquity PriceFeed rules @ each event's block",
    ...(part === "change" ? { formula: "later price ÷ earlier price − 1" } : {}),
    verify: {
      kind: "recompute",
      text: note.live
        ? `Open the earlier event on this page — ${endClause(note.from)} — and read the price on its card; that is the earlier figure here. The later figure is the price at the latest block, so it changes as new blocks arrive. Shown because ${priceGapReason(note)}.`
        : `Open the two events on this page — ${endClause(note.from)} and ${endClause(note.to)} — and read the price on each card; they are the two figures here. Shown because ${priceGapReason(note)}.`,
    },
    inputs: [
      priceLeaf(note.from, "earlier", priceDecimals(note)),
      priceLeaf(note.to, "later", priceDecimals(note), note.live),
      {
        label: "blocks",
        value: `${note.from.block} → ${note.to.block}`,
        kind: "chain",
        pclass: "emitted",
        note: note.live
          ? `the block of the trove's last event that has a price (${note.from.block}) and the latest block when this page loaded (${note.to.block})`
          : `the two events' block numbers — ${note.from.block} and ${note.to.block}`,
      },
    ],
  };
};

/**
 * What the move meant for this trove: the collateral ratio the earlier event's
 * own debt and collateral made at each end's price, and the branch minimum
 * they are read against.
 *
 * `crAfter` is the one figure here the chain never stated. It holds the
 * earlier event's debt and collateral fixed and moves only the price, which is
 * what makes it comparable to `crBefore` — and it is why the sentence says
 * "at the debt and collateral recorded at block N" rather than implying a
 * second reading. Interest kept accruing across the stretch, so the trove's
 * real ratio at the later block was a little lower than this.
 */
export const priceGapPositionProv = (
  note: PriceGapNote,
  part: "state" | "crBefore" | "crAfter" | "mcr",
): Provenance => {
  const p = note.position;
  const end = part === "crAfter" ? note.to : note.from;
  const stateLeaves = [
    {
      label: "collateral",
      value: p ? String(p.coll) : undefined,
      kind: "chain" as const,
      pclass: "emitted" as const,
      note: `the collateral the contract logged for this trove at block ${p?.atBlock}`,
    },
    {
      label: "debt",
      value: p ? String(p.debt) : undefined,
      kind: "chain" as const,
      pclass: "emitted" as const,
      note: `the debt the contract logged for this trove at block ${p?.atBlock}`,
    },
  ];
  const logged = `the collateral and debt the contract logged for this trove at block ${p?.atBlock}`;
  const ratioOf = (price: string) => `${logged}: the collateral valued at ${price}, divided by the debt`;
  const summary =
    part === "mcr"
      ? `The branch minimum — the collateral ratio below which a ${note.marketSymbol} trove can be liquidated. It is fixed in the ${note.marketSymbol} branch's contracts and is the same for every trove in the branch.`
      : part === "state"
        ? `The block of the debt and collateral used for both ratios — the block of the earlier of the two events.`
        : part === "crBefore"
          ? `This trove's collateral ratio at the earlier event — from ${ratioOf(`Liquity's ${note.marketSymbol} price at that block`)}.`
          : note.live
            ? `The same debt and collateral at the current price — from ${ratioOf(`the current ${note.marketSymbol} price of ${formatPrice(note.to.value, priceDecimals(note))}`)}. Interest has kept adding to the debt since that block, so the ratio on the position card, which includes it, is lower.`
            : `The same debt and collateral at the later price — from ${ratioOf(`the later ${note.marketSymbol} price of ${formatPrice(note.to.value, priceDecimals(note))}`)}. Interest kept adding to the debt across the stretch, so the trove's ratio at the later block was lower than this.`;
  const derived = part === "crBefore" || part === "crAfter";
  return {
    kind: derived ? "chain-derived" : "chain",
    pclass: part === "mcr" ? "indexed" : derived ? "state" : "emitted",
    summary,
    ...(part === "mcr" ? {} : feed(note)),
    ...(derived
      ? {
          via: "the earlier event's logged debt and collateral × the price at this end",
          formula: "(collateral × price) ÷ debt × 100",
        }
      : {}),
    verify: {
      kind: "recompute",
      text:
        part === "mcr"
          ? `Read MCR() on the branch's BorrowerOperations — the constant this trove would be liquidated against, unchanged since deployment.`
          : part === "state"
            ? `Open this trove's event at block ${p?.atBlock} on this page: the debt and collateral on its card are the two the ratios here are built from.`
            : `Take the debt and collateral on the card of the event at block ${p?.atBlock}, multiply the collateral by ${formatPrice(end.value, priceDecimals(note))} and divide by the debt. Shown because ${priceGapReason(note)}.`,
    },
    inputs:
      part === "mcr"
        ? [
            {
              label: "MCR",
              value: `${p?.mcrPct ?? "—"}%`,
              kind: "chain",
              pclass: "indexed",
              note: "branch constant",
            },
          ]
        : part === "state"
          ? stateLeaves
          : [
              ...stateLeaves,
              priceLeaf(
                end,
                part === "crAfter" ? "later" : "earlier",
                priceDecimals(note),
                part === "crAfter" && note.live,
              ),
            ],
  };
};

/**
 * The time between the two ends: the difference of the two events' block
 * timestamps, each the header of the block the event sits in. Exact — not a
 * block count times an assumed block time — and silent about where inside the
 * stretch the price moved.
 */
const elapsedProv = (note: PriceGapNote): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  summary: note.live
    ? `The time since the earlier event — the timestamp of the latest block when this page loaded, minus the timestamp of the block of this trove's last event that has a price.`
    : `The time between the two events — the timestamp of the later event's block minus the timestamp of the earlier event's block.`,
  ...feed(note),
  via: note.live
    ? "block header timestamps of the earlier event's block and the latest block"
    : "block header timestamps at each end",
  formula: "timestamp after − timestamp before",
  verify: {
    kind: "recompute",
    text: note.live
      ? `Open blocks ${note.from.block} and ${note.to.block} on a block explorer and subtract the two timestamps.`
      : `Open blocks ${note.from.block} and ${note.to.block} on a block explorer and subtract the two timestamps, or read the two events' dates on this page.`,
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
