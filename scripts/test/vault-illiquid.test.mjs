// lib/vaults/illiquid.ts against hand-made queues (rails-ops ui-jobs 540).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  vaultIlliquid,
  illiquidSentence,
  borrowRateYearly,
  MAX_RATE_AT_TARGET,
  RATE_CEILING_YEARLY,
  ADAPTIVE_CURVE_IRM,
} from "../../lib/vaults/illiquid.ts";

const IRM = ADAPTIVE_CURVE_IRM[8453];
const leg = (o) => ({
  id: "0x" + "11".repeat(32),
  collateralSymbol: "RLP",
  isIdle: false,
  irm: IRM,
  lltv: 0.86,
  vaultAssets: 0n,
  supplyAssets: 1000n,
  borrowAssets: 1000n,
  lastUpdate: 1_760_000_000,
  rateAtTarget: MAX_RATE_AT_TARGET,
  ...o,
});
const idle = (assets) =>
  leg({
    id: "0x" + "00".repeat(32),
    collateralSymbol: null,
    isIdle: true,
    irm: "0x" + "0".repeat(40),
    vaultAssets: assets,
    supplyAssets: assets * 2n,
    borrowAssets: 0n,
    rateAtTarget: null,
  });

test("the ceiling is 800% a year", () => {
  assert.equal(Math.round(RATE_CEILING_YEARLY * 100), 800);
  assert.equal(Math.round(borrowRateYearly(MAX_RATE_AT_TARGET, 1) * 100), 800);
});

test("a market at full utilisation and the maximum rate, holding most of the vault, is caught", () => {
  const il = vaultIlliquid(8453, 100, [
    idle(10n),
    leg({ vaultAssets: 990n, supplyAssets: 1000n, borrowAssets: 1000n }),
  ]);
  assert.ok(il);
  assert.equal(il.markets.length, 1);
  assert.equal(il.withdrawable, "10");
  assert.equal(
    illiquidSentence(il),
    "The RLP market holds 99% of the vault, 100% borrowed at the rate ceiling (800% a year).",
  );
});

test("under 10% of the vault is not caught", () => {
  assert.equal(vaultIlliquid(8453, 1, [idle(950n), leg({ vaultAssets: 50n })]), null);
});

test("99.8% borrowed is not caught; 99.9% is", () => {
  assert.equal(vaultIlliquid(8453, 1, [leg({ vaultAssets: 500n, borrowAssets: 998n })]), null);
  assert.ok(vaultIlliquid(8453, 1, [leg({ vaultAssets: 500n, borrowAssets: 999n })]));
});

test("a rate at target under the maximum is not caught", () => {
  assert.equal(vaultIlliquid(8453, 1, [leg({ vaultAssets: 500n, rateAtTarget: MAX_RATE_AT_TARGET - 1n })]), null);
});

test("another IRM, or another chain's, is not caught", () => {
  assert.equal(vaultIlliquid(8453, 1, [leg({ vaultAssets: 500n, irm: ADAPTIVE_CURVE_IRM[1] })]), null);
  assert.equal(vaultIlliquid(1, 1, [leg({ vaultAssets: 500n })]), null);
});

test("several markets read as one sentence, the utilisation floored", () => {
  const il = vaultIlliquid(8453, 1, [
    leg({ id: "0xa", collateralSymbol: "USR", vaultAssets: 700n }),
    leg({ id: "0xb", collateralSymbol: "wstUSR", vaultAssets: 200n, supplyAssets: 10000n, borrowAssets: 9999n }),
    leg({ id: "0xc", collateralSymbol: "RLP", vaultAssets: 100n }),
  ]);
  assert.equal(
    illiquidSentence(il),
    "The USR, wstUSR and RLP markets hold 100% of the vault, 99.9% to 100% borrowed at the rate ceiling (800% a year).",
  );
  assert.equal(il.withdrawable, "1");
});
