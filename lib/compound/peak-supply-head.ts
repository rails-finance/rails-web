// A closed Compound V3 card's supply-side peak head (rails-ops ui-jobs 803):
// its face label, the lines its dropdown holds in order, and what the face
// leads with. Collateral posted heads the side "Peak collateral": two or
// more assets lead with the one picked by value (`pickMainAsset`), one asset
// leads with itself. The lent base, where the account was ever a net lender,
// is a line under its caption in the dropdown and never leads. A wallet that
// only lent the base posted no collateral: its head is "Peak supplied" and
// leads with the base. Imports nothing, so scripts/test reads it directly.

export type CompoundPeakSupplyLine =
  | { kind: "collateral"; index: number }
  /** "Peak supplied X (earns interest)", over the lent base. */
  | { kind: "caption" }
  | { kind: "base" };

export interface CompoundPeakSupplyHead {
  /** "supplied" when no collateral was posted and the base was lent. */
  label: "collateral" | "supplied";
  lines: CompoundPeakSupplyLine[];
  /** What the face leads with: the collateral asset picked by value, the
   *  one collateral asset, or the lent base. Null: nothing recorded. */
  lead: { kind: "pick" } | { kind: "collateral"; index: number } | { kind: "base" } | null;
}

export function compoundPeakSupplyHead(collateralAssets: number, lentBase: number): CompoundPeakSupplyHead {
  const lent = lentBase > 0;
  const supplyOnly = collateralAssets === 0 && lent;
  const lines: CompoundPeakSupplyLine[] = [];
  if (supplyOnly) lines.push({ kind: "base" });
  for (let index = 0; index < collateralAssets; index++) lines.push({ kind: "collateral", index });
  if (!supplyOnly && lent) lines.push({ kind: "caption" }, { kind: "base" });
  return {
    label: supplyOnly ? "supplied" : "collateral",
    lines,
    lead: supplyOnly
      ? { kind: "base" }
      : collateralAssets > 1
        ? { kind: "pick" }
        : collateralAssets === 1
          ? { kind: "collateral", index: 0 }
          : null,
  };
}
