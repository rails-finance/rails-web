// Basedollar (Liquity V2 fork) provenance vocabulary (chain-state tier).
// ----------------------------------------------------------------------------
// An instantiation of the shared Liquity-V2-fork vocabulary factory — the
// on-chain anatomy (TroveUpdated absolutes, indexed befores, chain-derived
// deltas, the batched-debt caveat) is the contract family's, described once in
// lib/shared/liquity-fork-provenance.ts. Only what names THIS deployment lives
// here: the protocol name, the BD stablecoin, the backend table prefix, and
// the branch → TroveManager mapping.

import { makeLiquityForkVocabulary, type LiquityForkCoords, type DeltaOps } from "@/lib/shared/liquity-fork-provenance";
import { resolveBranch, BASEDOLLAR_BRANCHES } from "./asset-catalog";
import { BASEDOLLAR_PRICE_GRADES } from "./price-feeds";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";

export type BasedollarCoords = LiquityForkCoords;

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
  protocolName: "Basedollar",
  stablecoin: "BD",
  tablePrefix: "basedollar",
  chainId: BASE_CHAIN_ID,
  troveManagerContract: (collateralType) => {
    const b = resolveBranch(collateralType) ?? BASEDOLLAR_BRANCHES.weth;
    return { name: `Basedollar ${b.symbol} TroveManager`, address: b.troveManager };
  },
  priceFeedContract: (collateralType) => {
    const b = resolveBranch(collateralType) ?? BASEDOLLAR_BRANCHES.weth;
    return { name: `Basedollar ${b.symbol} PriceFeed`, address: b.priceFeed, decimals: b.decimals };
  },
  priceGrade: (collateralType) => {
    const b = resolveBranch(collateralType);
    return b ? BASEDOLLAR_PRICE_GRADES[b.key] : undefined;
  },
});
