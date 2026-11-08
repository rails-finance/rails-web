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
  adaptedRateAtTarget,
} from "../../lib/vaults/illiquid.ts";

const IRM = ADAPTIVE_CURVE_IRM[8453];
/** The block's timestamp: the legs' lastUpdate, so nothing adapts unless a test says so. */
const T = 1_760_000_000;
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
  const il = vaultIlliquid(8453, 100, T, [
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
  assert.equal(vaultIlliquid(8453, 1, T, [idle(950n), leg({ vaultAssets: 50n })]), null);
});

test("99.8% borrowed is not caught; 99.9% is", () => {
  assert.equal(vaultIlliquid(8453, 1, T, [leg({ vaultAssets: 500n, borrowAssets: 998n })]), null);
  assert.ok(vaultIlliquid(8453, 1, T, [leg({ vaultAssets: 500n, borrowAssets: 999n })]));
});

test("a rate at target under the maximum is not caught", () => {
  assert.equal(vaultIlliquid(8453, 1, T, [leg({ vaultAssets: 500n, rateAtTarget: MAX_RATE_AT_TARGET - 1n })]), null);
});

test("another IRM, or another chain's, is not caught", () => {
  assert.equal(vaultIlliquid(8453, 1, T, [leg({ vaultAssets: 500n, irm: ADAPTIVE_CURVE_IRM[1] })]), null);
  assert.equal(vaultIlliquid(1, 1, T, [leg({ vaultAssets: 500n })]), null);
});

test("several markets read as one sentence, the utilisation floored", () => {
  const il = vaultIlliquid(8453, 1, T, [
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

test("a full market's stored minimum adapts to the maximum in about 55 days", () => {
  const MIN = 1_000_000_000_000_000_000n / 1000n / 31_536_000n;
  const stale = leg({ vaultAssets: 500n, rateAtTarget: MIN });
  assert.equal(vaultIlliquid(8453, 1, T + 50 * 86_400, [stale]), null);
  const il = vaultIlliquid(8453, 1, T + 60 * 86_400, [stale]);
  assert.ok(il);
  assert.equal(Math.round(il.markets[0].borrowRateYearly * 100), 800);
  assert.equal(adaptedRateAtTarget(MAX_RATE_AT_TARGET, 0.5, 365 * 86_400), MIN);
});
