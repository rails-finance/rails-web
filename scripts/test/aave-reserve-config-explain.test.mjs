// lib/shared/aave-reserve-config-explain.ts: an Aave V3 reserve's configuration
// changes explained, one row at a time, on rows shaped as
// GET /api/aave-v3/reserve-config-log gives them.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { reserveChangesExplained } from "../../lib/shared/aave-reserve-config-explain.ts";

let li = 0;
const row = (block, kind, fields) => ({
  kind,
  block,
  txIndex: 0,
  logIndex: li++,
  timestamp: 1_700_000_000 + block,
  txHash: `0x${block.toString(16)}`,
  ...fields,
});
// Newest first, as reserveChanges gives them; the words as it writes them.
const changes = [
  { row: row(9, "asset-category", { from: 0, to: 1 }), words: "eMode category none → ETH correlated (1)" },
  { row: row(8, "borrowing", { enabled: false }), words: "Borrowing off" },
  { row: row(7, "frozen", { frozen: true }), words: "Frozen" },
  { row: row(6, "reserve-factor", { old: "1000", new: "1500" }), words: "Reserve factor 10% → 15%" },
  { row: row(5, "borrow-cap", { old: "2000000", new: "0" }), words: "Borrow cap 2,000,000 USDC → no cap" },
  { row: row(4, "supply-cap", { old: "1000000", new: "1500000" }), words: "Supply cap 1,000,000 → 1,500,000 USDC" },
  { row: row(3, "collateral", { ltv: 7500, lt: 7800, bonus: 10450 }), words: "LTV 77% → 75%" },
  {
    row: row(2, "collateral", { ltv: 7700, lt: 7800, bonus: 10450 }),
    words: "LTV 77%, LT 78%, liquidation bonus 4.5%",
  },
];
const compact = (v) => `${(v / 1e6).toFixed(1)}M`;
const out = reserveChangesExplained(changes, { symbol: "USDC", compact });
const head = (i) => [out[i].headline, out[i].figure ?? ""].join("|");

test("the head names what moved, with the figure", () => {
  assert.equal(head(0), "eMode category none → ETH correlated (1)|");
  assert.equal(head(1), "Borrowing turned off|");
  assert.equal(head(2), "Frozen|");
  assert.equal(head(3), "Reserve factor raised|10% → 15%");
  assert.equal(head(4), "Borrow cap removed|2.0M USDC → no cap");
  assert.equal(head(5), "Supply cap raised|1.0M → 1.5M USDC");
  assert.equal(head(6), "LTV lowered|77% → 75%");
  assert.equal(head(7), "Collateral terms set|");
});

test("the bullets say what the setting does and what the change means", () => {
  assert.deepEqual(out[0].bullets, []);
  assert.deepEqual(out[3].bullets, [
    "The reserve factor is the share of borrowers' interest that goes to the Aave treasury.",
    "At 15%, USDC suppliers earn 85% of the interest borrowers pay.",
  ]);
  assert.deepEqual(out[5].bullets, [
    "The supply cap is the most USDC the Pool takes in, across every supplier.",
    "Raising the supply cap by 0.5M, to 1.5M USDC, adds that much room for supply.",
  ]);
  assert.deepEqual(out[6].bullets, [
    "The LTV is the most a borrower can borrow against USDC, as a share of its value.",
    "At 75%, each $100 of USDC supports up to $75 of borrowing.",
  ]);
});
