// Receipts for an Alchemix V3 share-price note: the vault's share price at two
// of a position's readings, and what the move did to its collateral.
//
// Every figure is built from two readings already on the page. Each reading is
// a getCDP call and the MYT's convertToAssets(1e18), both at the reading's
// block (lib/alchemix/market-notes.ts). The collateral value and the
// collateralisation hold the share count and debt read at the earlier end and
// move only the share price, and the receipts say so.
//
// Shaped after lib/liquity/market-note-provenance.ts.

import type { Provenance } from "@/components/shared/provenance";
import {
  alchemixEndLabel,
  formatPrice,
  priceDecimals,
  priceGapReason,
  type MarketNotePoint,
  type PriceGapNote,
} from "@/lib/shared/market-note";

const shortHex = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

const underlyingOf = (note: PriceGapNote) => note.position?.valueSymbol ?? "the asset underneath";

/** One end in prose: the reading at one of the timeline's blocks. */
const endClause = (p: MarketNotePoint): string =>
  p.kind === "head"
    ? `the share price read with the position card's figures at block ${p.block}`
    : `the reading at this position's ${alchemixEndLabel(p)} at block ${p.block} (${shortHex(p.txHash)})`;

const vault = (note: PriceGapNote) =>
  note.marketAddress
    ? { contract: { name: `${note.marketSymbol} vault`, address: note.marketAddress } }
    : { contract: { name: `${note.marketSymbol} vault` } };

const priceLeaf = (note: PriceGapNote, p: MarketNotePoint, which: "earlier" | "later") => ({
  label: `share price ${which}`,
  value: formatPrice(p.value, priceDecimals(note)),
  kind: "chain" as const,
  pclass: "state" as const,
  note: `${endClause(p)}: convertToAssets(1e18) on the vault, in ${underlyingOf(note)}`,
});

/** The move itself: the two share prices, the change, the blocks, the time. */
export const alchemixSharePriceProv = (
  note: PriceGapNote,
  part: "price" | "change" | "blocks" | "elapsed",
): Provenance => {
  const pair = `${note.marketSymbol} share price`;
  const summary =
    part === "price"
      ? `The ${pair} at each end of the stretch: one share in ${underlyingOf(note)}, read with ${note.live ? "the position's newest reading and with the card's figures now" : "the position's two readings either side of it"}.`
      : part === "change"
        ? `How far the ${pair} moved across the stretch: the later price divided by the earlier one, minus one.`
        : part === "blocks"
          ? `The two blocks the stretch runs between: ${endClause(note.from)}, and ${endClause(note.to)}.`
          : `The time between the two readings: the later block's timestamp minus the earlier one's.`;
  const value =
    part === "price"
      ? `${formatPrice(note.from.value, priceDecimals(note))} → ${formatPrice(note.to.value, priceDecimals(note))}`
      : part === "change"
        ? String(note.changePct)
        : part === "blocks"
          ? `${note.from.block} → ${note.to.block}`
          : `${note.from.timestamp} → ${note.to.timestamp}`;
  return {
    kind: part === "change" || part === "elapsed" ? "chain-derived" : "chain",
    pclass: "state",
    summary,
    ...vault(note),
    via: "convertToAssets(1e18) on the vault, at each end's block",
    ...(part === "change" ? { formula: "later price ÷ earlier price − 1" } : {}),
    ...(part === "elapsed" ? { formula: "timestamp after − timestamp before" } : {}),
    verify: {
      kind: "recompute",
      text: `Call convertToAssets(1e18) on the ${note.marketSymbol} vault at blocks ${note.from.block} and ${note.to.block}. Shown because ${priceGapReason(note)}.`,
    },
    source: { block: note.to.block },
    inputs: [
      priceLeaf(note, note.from, "earlier"),
      priceLeaf(note, note.to, "later"),
      { label: part === "elapsed" ? "timestamps" : part, value, kind: "chain", pclass: "emitted" },
    ],
  };
};

/**
 * What the move meant for this position: the share count and debt read at the
 * earlier end, valued at each end's share price, and the line's liquidation
 * line they are read against.
 */
export const alchemixSharePricePositionProv = (
  note: PriceGapNote,
  part: "state" | "valueBefore" | "valueAfter" | "crBefore" | "crAfter" | "mcr",
): Provenance => {
  const p = note.position;
  const under = underlyingOf(note);
  const later = part === "valueAfter" || part === "crAfter";
  const end = later ? note.to : note.from;
  const price = formatPrice(end.value, priceDecimals(note));
  const stateLeaves = [
    {
      label: "shares",
      value: p ? String(p.coll) : undefined,
      kind: "chain" as const,
      pclass: "state" as const,
      note: `the ${note.marketSymbol} share count getCDP read at block ${p?.atBlock}`,
    },
    {
      label: "debt",
      value: p ? String(p.debt) : undefined,
      kind: "chain" as const,
      pclass: "state" as const,
      note: `the debt getCDP read at block ${p?.atBlock}`,
    },
  ];
  const summary =
    part === "mcr"
      ? `The line's liquidation line: at this collateralisation or below, anyone can liquidate the position. It is the Alchemist's collateralizationLowerBound as the position card reads it now; the value in force at block ${p?.atBlock} is not indexed.`
      : part === "state"
        ? `The block of the share count and debt used for every figure in this note: the earlier of the two readings.`
        : part === "valueBefore" || part === "valueAfter"
          ? `The collateral's value in ${under}: the share count read at block ${p?.atBlock} times the ${later ? (note.live ? "share price now" : "later share price") : "earlier share price"}, ${price}.`
          : `The collateralisation at the ${later ? (note.live ? "share price now" : "later share price") : "earlier share price"}: the share count read at block ${p?.atBlock}, valued at ${price}, divided by the debt read there, with one unit of debt counted as one ${under}.`;
  const derived = part !== "mcr" && part !== "state";
  return {
    kind: derived ? "chain-derived" : "chain",
    pclass: "state",
    summary,
    ...(part === "mcr" ? { contract: { name: "Alchemist V3" } } : vault(note)),
    ...(derived
      ? {
          via: "the earlier reading's shares and debt × the share price at this end",
          formula:
            part === "valueBefore" || part === "valueAfter"
              ? "shares × share price"
              : "(shares × share price) ÷ debt × 100",
        }
      : {}),
    verify: {
      kind: "recompute",
      text:
        part === "mcr"
          ? "Read collateralizationLowerBound() on the Alchemist."
          : part === "state"
            ? `Call getCDP at block ${p?.atBlock}: the share count and debt it returns are the two used here.`
            : `Take the share count and debt getCDP returns at block ${p?.atBlock} and value the shares at ${price}. Shown because ${priceGapReason(note)}.`,
    },
    source: { block: part === "mcr" ? undefined : p?.atBlock },
    inputs:
      part === "mcr"
        ? [{ label: "liquidation line", value: `${p?.mcrPct ?? "—"}%`, kind: "chain", pclass: "state" }]
        : part === "state"
          ? stateLeaves
          : [...stateLeaves, priceLeaf(note, end, later ? "later" : "earlier")],
  };
};
