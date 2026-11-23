// A closed Compound V3 card's supply-side peak head (rails-ops ui-jobs 803):
// which lines it holds, in order, and whether the head states its collateral
// by their icons. Two or more collateral assets do; the count is the
// collateral alone, and the lent base, where the account was ever a net
// lender, is a line under its caption and never counted. A wallet that only
// lent the base posted no collateral, and its head is "supply". Imports
// nothing, so scripts/test reads it directly.

export type CompoundPeakSupplyLine =
  | { kind: "collateral"; index: number }
  /** "Highest supplied X (earns interest)", over the lent base. */
  | { kind: "caption" }
  | { kind: "base" };

export interface CompoundPeakSupplyHead {
  /** "supply" when no collateral was posted and the base was lent. */
  label: "collateral" | "supply";
  lines: CompoundPeakSupplyLine[];
  /** Two or more collateral assets: the head shows their icons, and the
   *  press opens `lines` (the count names the button). Null: the head shows
   *  `lines` as they are. */
  count: number | null;
}

export function compoundPeakSupplyHead(collateralAssets: number, lentBase: number): CompoundPeakSupplyHead {
  const lent = lentBase > 0;
  const supplyOnly = collateralAssets === 0 && lent;
  const lines: CompoundPeakSupplyLine[] = [];
  if (supplyOnly) lines.push({ kind: "base" });
  for (let index = 0; index < collateralAssets; index++) lines.push({ kind: "collateral", index });
  if (!supplyOnly && lent) lines.push({ kind: "caption" }, { kind: "base" });
  return {
    label: supplyOnly ? "supply" : "collateral",
    lines,
    count: collateralAssets > 1 ? collateralAssets : null,
  };
}
