// verify-aave-v3-account-cells — the arithmetic behind the Aave V3 family's
// account cells (rails-ops TO-DO-ui-jobs §213): what can still be borrowed,
// the price chip's precision, and the interest since the previous event.
// ----------------------------------------------------------------------------
// OFFLINE, over hand-built position reads.
//
//   npx tsx --test scripts/verify/verify-aave-v3-account-cells.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  borrowableBase,
  interestSincePrevious,
  priceText,
  type AaveV3PositionState,
  type AaveV3PositionStateReserve,
} from "@/lib/aave-v3/position-state";

test("still borrowable is max LTV × collateral − debt, floored at zero", () => {
  // $21,080 at 76.71% less $7,909 → $8,261.47 (8-decimal base units).
  const side = {
    totalCollateralBase: "2108000000000",
    totalDebtBase: "790900000000",
    ltvBps: 7671,
    liquidationThresholdBps: 8047,
    healthFactor: null,
  };
  assert.equal(borrowableBase(side), BigInt("826146800000"));
  assert.equal(borrowableBase({ ...side, totalDebtBase: "2000000000000" }), BigInt(0));
  assert.equal(borrowableBase({ ...side, totalCollateralBase: "0", totalDebtBase: "0" }), BigInt(0));
});

test("the price chip prints the decimals that reproduce the USD figures", () => {
  // 7,912 USDT at 0.9996 is $7,909: "1.00" would print $7,912.
  assert.equal(priceText("99960000", [{ raw: "7912000000", decimals: 6 }]), "0.9996");
  // A dollar-exact stablecoin stays at two decimals.
  assert.equal(priceText("100000000", [{ raw: "7912000000", decimals: 6 }]), "1.00");
  // 0.125 BTC at $85,024.37 reads to the cent: the product rounds the same.
  assert.equal(priceText("8502437000000", [{ raw: "12500000", decimals: 8 }]), "85,024.37");
  // Nothing held: two decimals.
  assert.equal(priceText("99960000", []), "1.00");
});

const leg = (before: string, after: string) => ({
  before,
  after,
  scaledBefore: before,
  scaledAfter: after,
  index: "1000000000000000000000000000",
  rduBlock: 1,
  rduTxHash: "0x",
  rduTimestamp: 0,
  rate: "0",
});

const reserve = (
  reserve: string,
  symbol: string,
  decimals: number,
  supply: [string, string],
  debt: [string, string],
  collateral: { before: boolean; after: boolean } | null,
): AaveV3PositionStateReserve => ({
  reserve,
  symbol,
  decimals,
  supply: leg(...supply),
  debt: leg(...debt),
  collateral,
  priceBase: "100000000",
  ltvBps: 7500,
  liquidationThresholdBps: 8000,
  inEmode: false,
});

const state = (txHash: string, reserves: AaveV3PositionStateReserve[]): AaveV3PositionState => ({
  wallet: "0x1",
  market: "core",
  marketKey: "core",
  block: 1,
  txHash,
  txIndex: 0,
  blockTimestamp: 0,
  complete: true,
  reserves,
  emode: null,
  account: null,
  sources: {
    balances: "scaled-deltas",
    settings: "pool-events",
    market: "chain-read-at-block",
    marketReadBlock: 1,
    poolRevision: null,
  },
  notes: [],
});

test("interest since the previous event covers every debt and the collateral", () => {
  const prev = state("0xa", [
    reserve("0xusdt", "USDT", 6, ["0", "0"], ["7494233000", "7494233000"], { before: false, after: false }),
    reserve("0xwbtc", "WBTC", 8, ["12499000", "12499000"], ["0", "0"], { before: true, after: true }),
    reserve("0xusdc", "USDC", 6, ["5000000", "5000000"], ["0", "0"], { before: false, after: false }),
  ]);
  const here = state("0xb", [
    reserve("0xusdt", "USDT", 6, ["0", "0"], ["7512000000", "7912000000"], { before: false, after: false }),
    reserve("0xwbtc", "WBTC", 8, ["12500000", "12500000"], ["0", "0"], { before: true, after: true }),
    reserve("0xusdc", "USDC", 6, ["5000100", "5000100"], ["0", "0"], { before: false, after: false }),
  ]);
  const got = interestSincePrevious(here, prev);
  assert.deepEqual(got?.debt, [{ reserve: "0xusdt", symbol: "USDT", interest: "17.767" }]);
  // The USDC supply had its switch off: it is not collateral, and is left out.
  assert.deepEqual(got?.collateral, [{ reserve: "0xwbtc", symbol: "WBTC", interest: "0.00001" }]);
  // No previous read, or the same transaction: nothing to measure from.
  assert.equal(interestSincePrevious(here, undefined), null);
  assert.equal(interestSincePrevious(here, here), null);
});
