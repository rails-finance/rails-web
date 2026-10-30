// The borrowed asset's price at liquidation, on Aave V3 Core wallet
// 0x8d53903625b8e839b9df4bd28b0efb1cd6b8639a: 60m USDT against 19,763 WETH.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { aaveDebtLiquidation } from "../../lib/shared/aave-debt-liquidation.ts";

// The Pool's read at block 26,307,421: health factor 1.0626382003110755,
// debt $43,975,697.8911503 over 19,763.415029735336707387 WETH.
const HF = 1.0626382003110755;
const WETH_AMOUNT = 19_763.415029735336707387;
const WETH_PRICE = 43_975_697.8911503 / WETH_AMOUNT;
const weth = { symbol: "WETH", amount: WETH_AMOUNT, price: WETH_PRICE, stable: false };

test("one WETH debt: the price where the health factor reaches 1.0", () => {
  const r = aaveDebtLiquidation(HF, [weth]);
  assert.equal(r.symbol, "WETH");
  assert.equal(Math.round(r.price), 2225);
  // The debt can grow to the health factor times its value.
  assert.equal(Math.round(r.liqPrice), 2364);
  assert.equal(r.risePct.toFixed(1), "6.3");
});

test("dust in a second debt leaves the read, a spread debt or a stable one has none", () => {
  const dust = { symbol: "USDC", amount: 10, price: 1, stable: true };
  const withDust = aaveDebtLiquidation(HF, [weth, dust]);
  assert.ok(withDust && withDust.symbol === "WETH");
  const spread = { symbol: "WBTC", amount: 300, price: 70_000, stable: false };
  assert.equal(aaveDebtLiquidation(HF, [weth, spread]), null);
  assert.equal(aaveDebtLiquidation(1.2, [{ symbol: "USDC", amount: 100, price: 1, stable: true }]), null);
  assert.equal(aaveDebtLiquidation(0.9, [weth]), null);
  assert.equal(aaveDebtLiquidation(HF, [{ ...weth, price: null }]), null);
});
