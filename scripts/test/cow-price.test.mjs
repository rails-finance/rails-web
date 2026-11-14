// lib/cow/price.ts (rails-ops ui-jobs 657): the executed price runs on the
// sold amount less the fee. Figures from the Trade log of tx 0xcb37…df55
// (block 16,299,943; DUSD sold for ETH, feeAmount not 0) and of tx 0xca53…7056
// (block 25,746,207; WETH sold for USDC, feeAmount 0), both read on chain on
// 13 Nov 2026.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
    const url = new URL(specifier + ".ts", context.parentURL).href;
    if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { executedRatio, executedPriceNone, soldLessFee } = await import("../../lib/cow/price.ts");

test("a fee-bearing trade's price runs on the sold amount less the fee", () => {
  const sell = "83249501379607435875";
  const fee = "5930960076110900224";
  const buy = "61278013505183065";
  // The order's signed sellAmount, from the settle calldata.
  assert.equal(soldLessFee(sell, fee), "77318541303496535651");
  const r = executedRatio(sell, buy, fee, 18, 18);
  assert.ok(r);
  assert.equal(r.soldNet, "77318541303496535651");
  assert.ok(Math.abs(r.perBuy - 77.318541303496535651 / 0.061278013505183065) < 1e-6);
  // Without the fee deducted the price would be about 7.7% higher.
  const gross = 83.249501379607435875 / 0.061278013505183065;
  assert.ok(gross / r.perBuy > 1.07);
});

test("a trade with no fee keeps the plain ratio", () => {
  const r = executedRatio("4385934929927551", "8140771", "0", 18, 6);
  assert.ok(r);
  assert.equal(r.soldNet, "4385934929927551");
  assert.ok(Math.abs(r.perSell - 8.140771 / 0.004385934929927551) < 1e-6);
});

test("no price without decimals, or with a fee not below the sold amount", () => {
  assert.equal(executedRatio("100", "5", "0", null, 6), null);
  assert.equal(executedRatio("100", "5", "100", 6, 6), null);
  assert.equal(soldLessFee("100", "120"), null);
});

test("a fee not below the sold amount has its own reason, not the decimals'", () => {
  assert.equal(
    executedPriceNone({ sellAmount: "100", buyAmount: "5", feeAmount: "100" }, 6, 6),
    "no amount sold after the fee",
  );
  assert.equal(
    executedPriceNone({ sellAmount: "100", buyAmount: "5", feeAmount: "120" }, 6, 6),
    "no amount sold after the fee",
  );
  assert.equal(executedPriceNone({ sellAmount: "100", buyAmount: "5", feeAmount: "20" }, 6, 6), null);
  assert.equal(executedPriceNone({ sellAmount: "100", buyAmount: "5", feeAmount: "100" }, null, 6), null);
});

test("a bought amount of zero has its own reason, not the decimals'", () => {
  assert.equal(executedRatio("100", "0", "20", 6, 6), null);
  assert.equal(executedPriceNone({ sellAmount: "100", buyAmount: "0", feeAmount: "20" }, 6, 6), "no amount bought");
  // A sold amount that scales to zero at its decimals reads as nothing sold after the fee.
  assert.equal(executedRatio("1", "5", "0", 400, 6), null);
  assert.equal(
    executedPriceNone({ sellAmount: "1", buyAmount: "5", feeAmount: "0" }, 400, 6),
    "no amount sold after the fee",
  );
  assert.equal(executedPriceNone({ sellAmount: "100", buyAmount: "0", feeAmount: "20" }, null, 6), null);
});
