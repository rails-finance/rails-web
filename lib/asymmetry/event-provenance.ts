// Asymmetry (Liquity V2 fork) provenance vocabulary (chain-state tier).
// ----------------------------------------------------------------------------
// An instantiation of the shared Liquity-V2-fork vocabulary factory — the
// on-chain anatomy (TroveUpdated absolutes, indexed befores, chain-derived
// deltas, the batched-debt caveat) is the contract family's, described once in
// lib/shared/liquity-fork-provenance.ts. Only what names THIS deployment lives
// here: the protocol name, the USDaf stablecoin, the backend table prefix, and
// the branch → TroveManager mapping.

import { makeLiquityForkVocabulary, type LiquityForkCoords, type DeltaOps } from "@/lib/shared/liquity-fork-provenance";
import { resolveBranch, ASYMMETRY_BRANCHES } from "./asset-catalog";
import { ASYMMETRY_PRICE_GRADES } from "./price-feeds";

export type AsymmetryCoords = LiquityForkCoords;

export const {
  collDeltaProv,
  debtDeltaProv,
  collAfterProv,
  debtAfterProv,
  collBeforeProv,
  debtBeforeProv,
  atBlockPriceProv,
  upfrontFeeProv,
  accruedInterestProv,
  redemptionFeeKeptProv,
  redemptionActProv,
  emittedRedemptionPriceProv,
  liqSeizedUsdProv,
  liqClearedFaceProv,
  liqPremiumProv,
  positionCollateralProv,
  positionDebtProv,
  positionRateProv,
  peakCollateralProv,
  peakDebtProv,
  rateAtEventProv,
  batchManagerProv,
  lifetimeFlowProv,
} = makeLiquityForkVocabulary({
  protocolName: "Asymmetry",
  stablecoin: "USDaf",
  tablePrefix: "asymmetry",
  troveManagerContract: (collateralType) => {
    const b = resolveBranch(collateralType) ?? ASYMMETRY_BRANCHES.ysybold;
    return { name: `Asymmetry ${b.symbol} TroveManager`, address: b.troveManager };
  },
  priceFeedContract: (collateralType) => {
    const b = resolveBranch(collateralType) ?? ASYMMETRY_BRANCHES.ysybold;
    return { name: `Asymmetry ${b.symbol} PriceFeed`, address: b.priceFeed, decimals: b.decimals };
  },
  priceGrade: (collateralType) => {
    const b = resolveBranch(collateralType);
    return b ? ASYMMETRY_PRICE_GRADES[b.key] : undefined;
  },
});
