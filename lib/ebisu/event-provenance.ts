// Ebisu (Liquity V2 fork) provenance vocabulary (chain-state tier).
// ----------------------------------------------------------------------------
// An instantiation of the shared Liquity-V2-fork vocabulary factory — the
// on-chain anatomy (TroveUpdated absolutes, indexed befores, chain-derived
// deltas, the batched-debt caveat) is the contract family's, described once in
// lib/shared/liquity-fork-provenance.ts. Only what names THIS deployment lives
// here: the protocol name, the ebUSD stablecoin, the backend table prefix, and
// the branch → TroveManager mapping.

import { makeLiquityForkVocabulary, type LiquityForkCoords, type DeltaOps } from "@/lib/shared/liquity-fork-provenance";
import { resolveBranch, EBISU_BRANCHES } from "./asset-catalog";
import { EBISU_PRICE_GRADES } from "./price-feeds";

export type EbisuCoords = LiquityForkCoords;

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
  protocolName: "Ebisu",
  stablecoin: "ebUSD",
  tablePrefix: "ebisu",
  troveManagerContract: (collateralType) => {
    const b = resolveBranch(collateralType) ?? EBISU_BRANCHES.weeth;
    return { name: `Ebisu ${b.symbol} TroveManager`, address: b.troveManager };
  },
  priceFeedContract: (collateralType) => {
    const b = resolveBranch(collateralType) ?? EBISU_BRANCHES.weeth;
    return { name: `Ebisu ${b.symbol} PriceFeed`, address: b.priceFeed, decimals: b.decimals };
  },
  redemptionEmitter: (collateralType) => {
    const b = resolveBranch(collateralType) ?? EBISU_BRANCHES.weeth;
    return { name: `Ebisu ${b.symbol} EbisuBranchManager`, address: b.branchManager };
  },
  priceGrade: (collateralType) => {
    const b = resolveBranch(collateralType);
    return b ? EBISU_PRICE_GRADES[b.key] : undefined;
  },
});
