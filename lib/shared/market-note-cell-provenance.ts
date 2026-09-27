// Receipts for the opened market note's state cells.
// ---------------------------------------------------------------------------
// The opened note draws the grid a regular event of the same protocol draws
// (components/shared/market-note-row.tsx): the amounts the position held, which
// the price move leaves as they were, and those amounts valued at each end's
// price. The price receipts, the ratio receipts and the block receipts stay in
// each home's own module (lib/<protocol>/market-note-provenance.ts); what is
// shared across homes is the shape of these two figures, so they are built once
// here from what the home tells them.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import type { MarketNote } from "@/lib/shared/market-note";

/** Where the held amount was recorded, in the home's own words. */
export interface HeldSource {
  /** "this trove's event", "this position's reading", "this CDP's touch". */
  recordedBy: string;
  /** The block the amount was recorded at. */
  atBlock: number;
  /** The contract that logged it, where the home knows it. */
  contract?: { name: string; address?: string };
}

/**
 * An amount the position held across the stretch (collateral, debt, a rate,
 * a share count). The price move did not change it, so the opened note states
 * it once, greyed, the way a regular card states an unchanged figure.
 */
export function heldAmountProv(
  note: MarketNote,
  what: string,
  value: string,
  source: HeldSource,
  derivedFrom?: { formula: string; inputs: ProvInput[] },
): Provenance {
  return {
    kind: derivedFrom ? "chain-derived" : "chain",
    pclass: derivedFrom ? "state" : "emitted",
    summary:
      `The ${what} ${source.recordedBy} recorded at block ${source.atBlock.toLocaleString("en-US")}, the earlier end ` +
      `of the stretch. The note holds it fixed at both ends and moves only the ${note.marketSymbol} price.`,
    ...(source.contract ? { contract: source.contract } : {}),
    ...(derivedFrom ? { formula: derivedFrom.formula } : {}),
    verify: {
      kind: "recompute",
      text: `Open ${source.recordedBy} at block ${source.atBlock.toLocaleString("en-US")} on this page: its card states this figure.`,
    },
    inputs: derivedFrom?.inputs ?? [
      {
        label: what,
        value,
        kind: "chain",
        pclass: "emitted",
        note: `${source.recordedBy} at block ${source.atBlock}`,
      },
    ],
  };
}

/**
 * The held amount valued at one end's price: `amount × price`. The earlier
 * value is the amount at the price its own event recorded; the later one is
 * the same amount at the later price, which is the move's consequence.
 */
export function valueAtPriceProv(
  note: MarketNote,
  which: "before" | "after",
  amount: { label: string; value: string },
  price: { value: string; unit: string },
  source: HeldSource,
): Provenance {
  const end = which === "before" ? note.from : note.to;
  const endWord = which === "before" ? "the earlier" : note.live ? "the current" : "the later";
  return {
    kind: "chain-derived",
    pclass: "oracle",
    summary:
      `Value of the ${amount.label} at ${endWord} ${note.marketSymbol} price. The ${amount.label} ` +
      `${source.recordedBy} recorded at block ${source.atBlock.toLocaleString("en-US")}, multiplied by ` +
      `${price.value} ${price.unit}, the price at block ${end.block.toLocaleString("en-US")}.`,
    formula: `${amount.label} × price`,
    verify: {
      kind: "recompute",
      text: `Multiply ${amount.value} by ${price.value}. The price is the one on the note's price chip for this end.`,
    },
    inputs: [
      { label: amount.label, value: amount.value, kind: "chain", pclass: "emitted", note: `block ${source.atBlock}` },
      {
        label: "price",
        value: `${price.value} ${price.unit}`,
        kind: "chain-derived",
        pclass: "oracle",
        note: `block ${end.block}`,
      },
    ],
  };
}
