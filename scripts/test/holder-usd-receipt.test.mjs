// lib/shared/holder-usd-receipt.ts: every dollar in a wallet's band is worked
// out on its receipt (rails-ops ui-jobs 737): each token's amount, its price
// with its block where the read states one, amount × price, and the sum. A
// stablecoin's $1 face is a definition and says so. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const root = new URL("../../", import.meta.url).href;
const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = ${JSON.stringify(root)};
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    for (const ext of [".ts", ".tsx"]) {
      const url = root + specifier.slice(2) + ext;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { holderUsdReceipt } = await import("../../lib/shared/holder-usd-receipt.ts");
const rows = (p) => p.inputs.map((i) => `${i.label}=${i.value}`);

test("one token: amount × price, the price an oracle read at its block", () => {
  const p = holderUsdReceipt({
    what: "The wallet's collateral in USD",
    legs: [{ token: "pETH", amount: 2, amountNote: "Σ", price: 1500, priceNote: "curve × ETH/USD" }],
    block: 123,
    via: "GET /x",
  });
  assert.equal(p.formula, "amount × price");
  assert.deepEqual(rows(p), ["pETH amount=2 pETH", "pETH price=$1,500.00"]);
  assert.equal(p.kind, "chain-derived");
  assert.equal(p.pclass, "oracle");
  assert.deepEqual(p.source, { block: 123 });
  assert.match(p.summary, /at block 123/);
});

test("several tokens: each leg worked out, then the sum", () => {
  const p = holderUsdReceipt({
    what: "The wallet's collateral in USD",
    legs: [
      { token: "WETH", amount: 100, amountNote: "Σ", price: 2000, priceNote: "feed" },
      { token: "rETH", amount: 50, amountNote: "Σ", price: 2200, priceNote: "feed" },
    ],
    via: "GET /x",
  });
  assert.equal(p.formula, "Σ amount × price");
  assert.deepEqual(rows(p), [
    "WETH amount=100 WETH",
    "WETH price=$2,000.00",
    "WETH amount × price=$200,000.00",
    "rETH amount=50 rETH",
    "rETH price=$2,200.00",
    "rETH amount × price=$110,000.00",
    "sum=$310,000.00",
  ]);
  // A read that states no block says so.
  assert.equal(p.source, undefined);
  assert.match(p.summary, /states no block/);
});

test("a $1 face is a definition, said plainly", () => {
  const p = holderUsdReceipt({
    what: "The wallet's debt in USD",
    legs: [{ token: "BOLD", amount: 5, amountNote: "Σ", price: 1, face: true, priceNote: "face" }],
    via: "GET /x",
  });
  assert.equal(p.kind, "derived");
  assert.equal(p.inputs[1].definition, true);
  assert.match(p.summary, /1 BOLD is counted as \$1/);
});
