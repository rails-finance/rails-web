// Plain-language collateral-exposure summary for an Aave V4 position.
//
// Turns the position's chain-state collateral (per-asset USD + LT) into a
// neutral, factual sentence — "what is this collateral made of and at what
// blended liquidation threshold" — addressing the doc's 3.7 gap (composition
// shown but not interpreted). Strictly descriptive: class shares, asset count,
// blended LT. No risk valence, no "concentrated/risky" adjectives.

import { assetClass, ASSET_CLASS_LABEL, type AssetClass } from "./asset-class";

export interface ExposureInput {
  symbol: string;
  /** USD value supplied as collateral (already filtered to collateral-enabled). */
  collateralUsd: number;
  /** Chain-state liquidation threshold for this reserve, fraction in (0,1]. */
  lt: number;
}

export interface ExposureClassShare {
  cls: AssetClass;
  label: string;
  /** Whole-number percent of total collateral USD. */
  pct: number;
}

export interface CollateralExposure {
  totalUsd: number;
  assetCount: number;
  /** Class shares, descending by pct, rounded, only those ≥ 1%. */
  classes: ExposureClassShare[];
  /** Single dominant asset when one symbol holds ≥ 60% of collateral. */
  dominant: { symbol: string; pct: number } | null;
  /** Σ(usd·lt) / Σ(usd) — the position's blended liquidation threshold. */
  blendedLt: number | null;
  /** Neutral one-line summary, or "" when there's no collateral to describe. */
  sentence: string;
  /** Reduced, label-led form for the risk-footer strip (detail-page-anatomy
   *  §2): no leading "Collateral is", no terminal period — the RiskFigure
   *  label supplies the subject. `subject` is the asset name (single) or
   *  "N assets" (multi); `blended` says whether the LT clause reads
   *  "blended liquidation threshold". Null when there's nothing to describe. */
  reduced: { subject: string; ltPct: number | null; blended: boolean } | null;
}

/** Join label fragments as "A", "A and B", "A, B and C". */
function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function describeCollateralExposure(
  reserves: ExposureInput[],
  // Canonical blended LT from the spoke (AaveSpokeCardInfo.blendedLt), computed
  // with this same formula on the chain-state basis. When passed, the sentence
  // states it verbatim instead of recomputing, so the exposure line and the
  // position-explanation panel (which reads the same field) can't drift. Omit
  // (undefined) to compute locally; null suppresses the LT clause.
  blendedLtOverride?: number | null,
): CollateralExposure {
  const coll = reserves.filter((r) => r.collateralUsd > 0);
  const totalUsd = coll.reduce((s, r) => s + r.collateralUsd, 0);
  const empty: CollateralExposure = {
    totalUsd: 0,
    assetCount: 0,
    classes: [],
    dominant: null,
    blendedLt: null,
    sentence: "",
    reduced: null,
  };
  if (totalUsd <= 0 || coll.length === 0) return empty;

  // Class shares.
  const byClass = new Map<AssetClass, number>();
  for (const r of coll) {
    const c = assetClass(r.symbol);
    byClass.set(c, (byClass.get(c) ?? 0) + r.collateralUsd);
  }
  const classes: ExposureClassShare[] = [...byClass.entries()]
    .map(([cls, usd]) => ({ cls, label: ASSET_CLASS_LABEL[cls], pct: Math.round((usd / totalUsd) * 100) }))
    .filter((c) => c.pct >= 1)
    .sort((a, b) => b.pct - a.pct);

  // Dominant single asset (≥60%).
  const bySymbol = [...coll].sort((a, b) => b.collateralUsd - a.collateralUsd);
  const topPct = Math.round((bySymbol[0].collateralUsd / totalUsd) * 100);
  const dominant = topPct >= 60 ? { symbol: bySymbol[0].symbol, pct: topPct } : null;

  // Blended LT — the override when the caller holds the canonical spoke value,
  // otherwise Σ(usd·lt)/Σ(usd) over this reserve set.
  const blendedLtComputed = coll.reduce((s, r) => s + r.collateralUsd * r.lt, 0) / totalUsd;
  const blendedLt = blendedLtOverride !== undefined ? blendedLtOverride : blendedLtComputed;

  // Compose the sentence. A single asset reads best by name (the class label
  // is noise — "entirely AAVE" beats "all other across 1 asset"); multi-asset
  // lists the class shares, collapsing to "all X" when one class covers it.
  let sentence: string;
  // LT as a whole percent (not a 0–1 decimal) to match the position-explanation
  // panel's "about NN% of its value" phrasing — same metric, one format.
  const ltPct = blendedLt != null && blendedLt > 0 ? Math.round(blendedLt * 100) : 0;
  if (coll.length === 1) {
    const ltPart = ltPct > 0 ? `, at a ${ltPct}% liquidation threshold` : "";
    sentence = `Collateral is entirely ${bySymbol[0].symbol}${ltPart}.`;
  } else {
    const classPart =
      classes.length === 1 ? `all ${classes[0].label}` : joinClauses(classes.map((c) => `${c.pct}% ${c.label}`));
    const ltPart = ltPct > 0 ? `, at a ${ltPct}% blended liquidation threshold` : "";
    sentence = `Collateral is ${classPart} across ${coll.length} assets${ltPart}.`;
  }

  // Reduced form for the risk row: "WBTC" / "4 assets" + the LT percent; the
  // strip composes it as "{subject} at a {ltPct}% [blended ]liquidation
  // threshold" under its "Collateral" label.
  const reduced = {
    subject: coll.length === 1 ? bySymbol[0].symbol : `${coll.length} assets`,
    ltPct: ltPct > 0 ? ltPct : null,
    blended: coll.length > 1,
  };

  return { totalUsd, assetCount: coll.length, classes, dominant, blendedLt: blendedLt ?? null, sentence, reduced };
}
