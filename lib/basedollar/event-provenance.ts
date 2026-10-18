// Basedollar (Liquity V2 fork) provenance vocabulary (chain-state tier).
// ----------------------------------------------------------------------------
// An instantiation of the shared Liquity-V2-fork vocabulary factory — the
// on-chain anatomy (TroveUpdated absolutes, indexed befores, chain-derived
// deltas, the batched-debt caveat) is the contract family's, described once in
// lib/shared/liquity-fork-provenance.ts. Only what names THIS deployment lives
// here: the protocol name, the BD stablecoin, the backend table prefix, and
// the branch → TroveManager mapping.

import { gasEscrowReceipt, type LiquityGasEscrow } from "@/lib/shared/liquity-gas-escrow";
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

/** The gas compensation escrow: the WETH every Basedollar Trove sends to its
 *  branch's GasPool at its open, returned at the close and paid to the
 *  liquidator (the fork's ETH_GAS_COMPENSATION, an internal constant with no
 *  getter). Established from the deployed contracts' transfers: an open's WETH Transfer of 0.001 to the branch's GasPool and the close's back, on the WETH branch (open 0xd727b7e3…, close 0x4281a03a…), the rETH branch (open 0x0ce424b3…, close 0x56c80ba5…) and the wstETH branch (open 0x1a933e2e…), read on Base 18 Oct 2026. Basedollar does not use Liquity V2's 0.0375. */
export const BASEDOLLAR_GAS_ESCROW: LiquityGasEscrow = {
  protocol: "Basedollar",
  amount: 0.001,
  symbol: "WETH",
  address: "0x4200000000000000000000000000000000000006",
  source: "ETH_GAS_COMPENSATION, as the GasPool's WETH Transfers carry it",
  label: "0.001 WETH",
};

/** The escrow's receipt at an event. */
export const gasEscrowProv = gasEscrowReceipt(BASEDOLLAR_GAS_ESCROW, BASE_CHAIN_ID);
