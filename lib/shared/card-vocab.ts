// The position-card vocabulary — one table for the words every card's stat
// columns use, so eighteen cards cannot drift into eight spellings of the same
// axis (the sweep found "Collateral Ratio" / "Coll. ratio" / "Debt ratio" /
// "Health" / "Health Factor" for one column). Settled 2026-08-27 (rails-ops
// TO-DO-explorer-standardisation-sweep.md §1, decisions a + b):
//
// - The debt axis is "Debt" everywhere. A protocol's own noun for it
//   (Frankencoin mints ZCHF, PWN extends credit, Compound/Morpho track
//   principal) belongs in the column FOOTNOTE, not the label — the label names
//   the axis, the footnote names the mechanism.
// - The ratio column is sentence case and keyed by family: CDPs state a
//   collateral ratio, pooled lenders a health factor. The label must describe
//   the figure it sits over — a card whose native figure is the inverse (a
//   debt ratio) converts it or keeps its own label; it never borrows this one.
// - Terminal cards say "Highest recorded …" for a lifetime peak and "Final
//   recorded …" for a last-known state that is not a peak; "not recorded" has
//   one sentence.
//
// Labels here are the column HEADERS (12px, sentence case). Tower segment
// names ("Borrowed (all time)") and mode-pill words ("Borrowing", "Supply
// only", "In soft-liquidation") are a different vocabulary and stay where
// they are.

/** Which ratio a protocol family states over its position. */
export type RatioFamily = "cdp" | "pooled";

export const CARD_VOCAB = {
  /** Column headers on open cards. */
  collateral: "Collateral",
  supply: "Supply",
  debt: "Debt",
  ratio: {
    cdp: "Collateral ratio",
    pooled: "Health factor",
  } satisfies Record<RatioFamily, string>,
  /** Lifetime peaks on closed / liquidated cards. */
  peakCollateral: "Highest recorded collateral",
  peakSupply: "Highest recorded supply",
  peakDebt: "Highest recorded debt",
  /** Last-known state on terminal cards whose lane records no peak. */
  finalCollateral: "Final recorded collateral",
  finalDebt: "Final recorded debt",
} as const;

/** The ratio column header for a family — "Collateral ratio" for CDPs
 *  (Liquity family, Maker, Frankencoin, f(x)), "Health factor" for pooled
 *  lenders (Aave family, Morpho, Compound, Moonwell, Dolomite, LlamaLend). */
export function ratioLabel(family: RatioFamily): string {
  return CARD_VOCAB.ratio[family];
}

/** The one sentence a card shows where a lane recorded no peak for a column.
 *  `open` names what the reader opens to see the whole history — the
 *  position (most explorers) or the wallet (Morpho, where a wallet hub holds
 *  every market position). */
export function notRecordedNote(open: "position" | "wallet" = "position"): string {
  return `not recorded on this lane — open the ${open} for its whole history`;
}
