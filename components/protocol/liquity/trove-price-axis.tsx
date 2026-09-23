import { fmtPrice } from "@/components/shared/price-pill";

// The trove's price-runway bar is now the shared, cross-rail PriceRunway
// (components/shared/price-runway.tsx), rendered directly from trove-economics
// with the trove's oracle price + liquidation price. The old Conservative /
// Caution zone model lived here and has been dropped — Rails no longer
// editorializes where within the safe band a trove sits; the runway shows the
// factual distance to liquidation and the HF/ratio numbers carry the rest.
// Only the plain-language explanation copy remains here.

/**
 * Plain-language explanation for the trove's liquidation runway. Lives on the
 * position card's Explanation pane rather than inline on the bar, so help has
 * a single consistent home. One sentence (charter §4); the branch's minimum
 * collateral ratio is stated here — the one place the threshold is doing the
 * work — and nowhere else in the pane.
 */
export function trovePriceRunwayExplanation({
  collateralSymbol,
  debtSymbol,
  oraclePrice,
  liquidationPrice,
  mcr,
  liquidationPriceNode,
}: {
  collateralSymbol: string;
  debtSymbol: string;
  oraclePrice: number;
  liquidationPrice: number;
  /** The branch's minimum collateral ratio, in percent (e.g. 110). */
  mcr: number;
  /** Optional pre-wrapped render of the liquidation price (a `<Prov>` +
   *  mirrored highlight, so the figure traces and bolds like its "Liquidates
   *  at" chrome twin). Falls back to the plain formatted price. */
  liquidationPriceNode?: React.ReactNode;
}): React.ReactNode {
  const underwater = oraclePrice <= liquidationPrice;
  if (underwater) {
    return (
      <>
        Oracle price is <span className="font-semibold text-foreground">at or below the liquidation threshold</span>.
        This trove can be liquidated — any keeper hitting the contract repays the debt in {debtSymbol} and claims the
        collateral at a 10% bonus.
      </>
    );
  }
  const headroomPct = ((oraclePrice - liquidationPrice) / oraclePrice) * 100;
  return (
    <>
      {collateralSymbol} price would need to drop{" "}
      <span className="font-semibold text-foreground">{headroomPct.toFixed(1)}%</span> (to{" "}
      {liquidationPriceNode ?? fmtPrice(liquidationPrice)}) before this trove falls below the {mcr}% minimum collateral
      ratio and can be liquidated
    </>
  );
}
