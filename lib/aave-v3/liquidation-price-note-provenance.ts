// Receipts for the Aave-family liquidation price note — the seized asset's
// oracle price at this position's last row that touched it and at the
// liquidation (lib/aave-v3/liquidation-price-notes.ts).
// ----------------------------------------------------------------------------
// Both figures happened: each is the price the protocol's oracle answered at a
// row's block, stored per (reserve, block) by the price lane and served on the
// row. Nothing is read for the note, and each receipt names the row the figure
// sits on, so a reader can open that card and find the same number.
//
// What the receipts have to say that the other price-gap homes do not: the two
// ends need not be adjacent rows. Rows that touched other reserves can sit
// between them, and a row states only the price of the reserve it touched, so
// the receipt says which row the earlier end is and why that one.

import type { Provenance } from "@/components/shared/provenance";
import type { MarketNotePoint, PriceGapNote } from "@/lib/shared/market-note";
import {
  aaveFamilyEndLabel,
  aaveFamilyOracleOwner,
  formatPrice,
  priceDecimals,
  priceGapReason,
} from "@/lib/shared/market-note";

const shortHex = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** The protocol in prose, for "a SparkLend row". */
const rowNoun = (note: PriceGapNote): string => (note.protocol === "spark" ? "a SparkLend row" : "an Aave V3 row");

/** The route the rows were served by. */
const timelineRoute = (note: PriceGapNote): string =>
  note.protocol === "spark" ? "GET /api/spark/timeline" : "GET /api/aave-v3/timeline";

const endClause = (p: MarketNotePoint): string =>
  `${p.kind === "liquidation" ? "the" : "this position's"} ${aaveFamilyEndLabel(p)} at block ${p.block} ` +
  `(${shortHex(p.txHash)}, log ${p.logIndex})`;

/** Which field of the row the price is. */
const fieldOf = (p: MarketNotePoint, which: "earlier" | "later"): string =>
  which === "later" || p.kind === "liquidation"
    ? "context.data.collateralPrice.usd (or debtPrice.usd, for the covered debt)"
    : p.kind === "swap"
      ? "context.data.price.usd (or swap.receivedPrice.usd, for the received leg)"
      : "context.data.price.usd";

const reserveContract = (note: PriceGapNote) =>
  note.marketAddress ? { contract: { name: `${note.marketSymbol} (underlying)`, address: note.marketAddress } } : {};

const priceLeaf = (note: PriceGapNote, p: MarketNotePoint, which: "earlier" | "later") => ({
  label: `price ${which}`,
  value: formatPrice(p.value, priceDecimals(note)),
  kind: "chain-derived" as const,
  pclass: "oracle" as const,
  note:
    `${endClause(p)} — the price ${aaveFamilyOracleOwner(note)} oracle answered at that block, served on the row ` +
    `(${timelineRoute(note)} → ${fieldOf(p, which)})`,
  ...reserveContract(note),
});

/**
 * The gap: the two prices, the change between them, the two blocks, or the
 * time between them. One builder, four faces, each landing on the same two rows.
 */
export const aaveFamilyPriceGapProv = (
  note: PriceGapNote,
  part: "price" | "change" | "blocks" | "elapsed",
): Provenance => {
  if (part === "elapsed") return elapsedProv(note);
  const sym = note.marketSymbol;
  const summary =
    part === "price"
      ? `The ${sym} oracle price at each end of the stretch — the price ${aaveFamilyOracleOwner(note)} oracle ` +
        `answered at each row's block, stored per reserve and block and served on the row. The earlier end is ` +
        `this position's last row that touched ${sym} before the liquidation; the later is the liquidation's ` +
        `price for the collateral it seized. Both are historic readings, fixed at their blocks, and each is the ` +
        `figure that row's card states. ${rowNoun(note)[0].toUpperCase()}${rowNoun(note).slice(1)} carries the ` +
        `price of the reserve it touched and no other, so nothing is stated about the ${sym} price between these ` +
        `two blocks.`
      : part === "change"
        ? `How far the ${sym} oracle price moved across the stretch — the liquidation's price against the price ` +
          `at this position's last earlier row that touched ${sym}. The note states the move and nothing more. ` +
          `It does not say the move caused the liquidation: the debt side and the rest of the account move too, ` +
          `and a seized asset's price can rise into its liquidation.`
        : `The two blocks the stretch runs between — this position's last row that touched ${sym} before the ` +
          `liquidation, and the liquidation. Rows of this position that touched other reserves can sit between ` +
          `them; none of them touched ${sym}.`;
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
    ...reserveContract(note),
    via: `the two rows' stored prices · ${aaveFamilyOracleOwner(note)} oracle @ each block`,
    ...(part === "change" ? { formula: "later price ÷ earlier price − 1" } : {}),
    verify: {
      kind: "recompute",
      text:
        `Open the two rows on this page — ${endClause(note.from)} and ${endClause(note.to)} — and read the ` +
        `${sym} price each card states; they are the two figures here (value ${value}). ` +
        `${aaveFamilyOracleOwner(note)} oracle answers the same numbers at those blocks against an archive node ` +
        `(getAssetPrice(${note.marketAddress})). The stretch is stated because ${priceGapReason(note)} that seized ` +
        `${sym}.`,
    },
    inputs: [
      priceLeaf(note, note.from, "earlier"),
      priceLeaf(note, note.to, "later"),
      {
        label: "blocks",
        value: `${note.from.block} → ${note.to.block}`,
        kind: "chain",
        pclass: "emitted",
        note: `the two rows' block numbers — ${note.from.block} and ${note.to.block}`,
      },
    ],
  };
};

/** The time between the two ends, from the two blocks' header timestamps. */
const elapsedProv = (note: PriceGapNote): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  summary:
    `The time between the two rows — the later block's timestamp less the earlier's, both from the headers of ` +
    `the blocks the two rows sit in, so no block-time estimate enters it. It bounds when the price moved and says ` +
    `nothing about where inside the stretch it did.`,
  ...reserveContract(note),
  via: "block headers · timestamp at each end",
  formula: "timestamp after − timestamp before",
  verify: {
    kind: "recompute",
    text: `Open each block on the chain's explorer — ${note.from.block} and ${note.to.block} — and subtract the two timestamps; or read the two rows' dates on this page.`,
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
