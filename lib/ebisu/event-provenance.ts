// Ebisu (Liquity V2 fork) provenance vocabulary (chain-state tier).
// ----------------------------------------------------------------------------
// An instantiation of the shared Liquity-V2-fork vocabulary factory — the
// on-chain anatomy (TroveUpdated absolutes, indexed befores, chain-derived
// deltas, the batched-debt caveat) is the contract family's, described once in
// lib/shared/liquity-fork-provenance.ts. Only what names THIS deployment lives
// here: the protocol name, the ebUSD stablecoin, the backend table prefix, and
// the branch → TroveManager mapping.

import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { gasEscrowReceipt, type LiquityGasEscrow } from "@/lib/shared/liquity-gas-escrow";
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
  liquidationLegProv,
  liqPenaltyProv,
  redistProv,
  positionCollateralProv,
  positionDebtProv,
  positionRateProv,
  peakCollateralProv,
  peakDebtProv,
  rateAtEventProv,
  batchManagerProv,
  lifetimeFlowProv,
  collUsdProv,
  collRatioProv,
  rateBeforeProv,
  costPerYearProv,
  batchDebtShareProv,
  batchFeeShareProv,
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

/** The gas compensation escrow: the WETH every Ebisu Trove sends to its
 *  branch's GasPool at its open, returned at the close and paid to the
 *  liquidator (the fork's ETH_GAS_COMPENSATION, an internal constant with no
 *  getter). Established from the deployed contracts' transfers: an open's WETH Transfer of 0.0375 to the branch's GasPool and the close's back (sUSDe Trove …6657: open 0xc5d6c709…, close 0x41c49d7e…), and a liquidation's from the GasPool (weETH 0x26de1cb1…), read on mainnet 18 Oct 2026. */
export const EBISU_GAS_ESCROW: LiquityGasEscrow = {
  protocol: "Ebisu",
  amount: 0.0375,
  symbol: "WETH",
  address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  source: "ETH_GAS_COMPENSATION, as the GasPool's WETH Transfers carry it",
  label: "0.0375 WETH",
};

/** The escrow's receipt at an event. */
export const gasEscrowProv = gasEscrowReceipt(EBISU_GAS_ESCROW, MAINNET_CHAIN_ID);
