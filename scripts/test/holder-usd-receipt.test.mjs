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
  const { prov: p } = holderUsdReceipt({
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
  const { prov: p } = holderUsdReceipt({
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
  // A read that names no block says so.
  assert.equal(p.source, undefined);
  assert.match(p.summary, /the prices at the latest read, which names no block/);
});

test("a $1 face is a definition, said plainly", () => {
  const { prov: p } = holderUsdReceipt({
    what: "The wallet's debt in USD",
    legs: [{ token: "BOLD", amount: 5, amountNote: "Σ", price: 1, face: true, priceNote: "face" }],
    via: "GET /x",
  });
  assert.equal(p.kind, "derived");
  assert.equal(p.inputs[1].definition, true);
  assert.match(p.summary, /1 BOLD is counted as \$1/);
  // Nothing was read, so the summary names no read and no block.
  assert.doesNotMatch(p.summary, /read|block/);
});

test("the rows rebuild the figure, with awkward numbers", () => {
  const { prov, usd } = holderUsdReceipt({
    what: "x",
    legs: [
      { token: "WETH", amount: 12.34567, amountNote: "Σ", price: 3456.789, priceNote: "feed" },
      { token: "pETH", amount: 0.1234567, amountNote: "Σ", price: 0.98765432, priceNote: "feed" },
    ],
    via: "GET /x",
  });
  const val = (label) => prov.inputs.find((i) => i.label === label).value;
  const num = (t) => Number(t.replace(/[^0-9.]/g, ""));
  // Each product is the shown amount × the shown price, to the cent.
  for (const t of ["WETH", "pETH"]) {
    const product = Math.round(num(val(`${t} amount`)) * num(val(`${t} price`)) * 100) / 100;
    assert.equal(num(val(`${t} amount × price`)), product, t);
  }
  // The sum is the sum of the shown products, and the figure is the sum.
  const sum = Math.round((num(val("WETH amount × price")) + num(val("pETH amount × price"))) * 100) / 100;
  assert.equal(num(val("sum")), sum);
  assert.equal(usd, sum);
  assert.equal(val("WETH amount"), "12.34567 WETH");
  assert.equal(val("WETH price"), "$3,456.789");
  assert.equal(val("pETH price"), "$0.987654");
});

test("a negative amount and its product lead with a minus sign (ui-jobs 743)", () => {
  const { prov, usd } = holderUsdReceipt({
    what: "A change",
    legs: [
      { token: "WETH", amount: -0.5, amountNote: "a", price: 3000, priceNote: "p" },
      { token: "USDC", amount: 2, amountNote: "a", price: 1, priceNote: "p" },
    ],
    via: "v",
  });
  const val = (label) => prov.inputs.find((i) => i.label === label).value;
  assert.equal(val("WETH amount"), "−0.5 WETH");
  assert.equal(val("WETH amount × price"), "−$1,500.00");
  assert.equal(val("sum"), "−$1,498.00");
  assert.equal(usd, -1498);
});

test("a $1-face receipt states the amount to six decimals and its product (ui-jobs 743)", async () => {
  const { faceUsdProv } = await import("../../lib/shared/flows-timeline-provenance.ts");
  const p = faceUsdProv("BOLD", 1234.5678919, "after");
  const val = (label) => p.inputs.find((i) => i.label === label).value;
  assert.equal(val("debt"), "1,234.567892 BOLD");
  assert.equal(val("debt × $1"), "$1,234.57");
});

test("shown values above ten million keep fifteen significant figures", async () => {
  const { centsOf, shownAmount } = await import("../../lib/shared/shown-usd.ts");
  assert.equal(centsOf(10_000_000.005), 10_000_000.01);
  assert.equal(centsOf(123_456_789.125), 123_456_789.13);
  assert.equal(shownAmount(12_345_678.1234565), 12_345_678.123457);
  assert.equal(shownAmount(1_234_567_890.1234565), 1_234_567_890.12346);
});
