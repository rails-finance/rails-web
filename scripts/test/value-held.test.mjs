// The value held in open positions: an explorer adds only when its row is
// counted with a finite figure, every launched explorer must answer, and the
// total is recomputed.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { formatValueHeld, groupLeftOut, settleValueHeld, spokenValueHeld } from "../../lib/home/value-held.ts";

const roster = [
  { id: "aave-v3", slug: "aave-v3", chainId: 1, label: "Aave V3", chainName: "Ethereum" },
  { id: "maple", slug: "maple", chainId: 1, label: "Maple", chainName: "Ethereum" },
  { id: "fluid", slug: "fluid", chainId: 1, label: "Fluid", chainName: "Ethereum" },
];
const row = (protocol, o = {}) => ({
  protocol,
  chainId: 1,
  counted: true,
  usd: 100,
  block: { from: 5, to: 5 },
  blockTime: null,
  priceSource: "on-chain_oracle",
  priceOracleOwner: "own",
  leftOut: [],
  ...o,
});
const data = (explorers, totalUsd) => ({ computedAt: "2026-11-02T00:00:00Z", totalUsd, explorers, overlaps: [] });
const quiet = () => {
  const orig = console.error;
  console.error = () => {};
  return () => (console.error = orig);
};

test("counted rows add; an uncounted row is named, not added", () => {
  const v = settleValueHeld(
    data(
      [
        row("aave-v3", { usd: 300 }),
        row("maple", { usd: 100, priceOracleOwner: "aave-v3" }),
        row("fluid", { counted: false, usd: null, reason: "no USD price" }),
      ],
      400,
    ),
    roster,
  );
  assert.equal(v.totalUsd, 400);
  assert.deepEqual(
    v.rows.map((r) => [r.label, r.share]),
    [
      ["Aave V3", 0.75],
      ["Maple", 0.25],
    ],
  );
  assert.equal(v.rows[1].oracleOf, "Aave V3's oracle");
  assert.equal(v.rows[1].prices, "on-chain oracle");
  assert.deepEqual(v.notCounted, [{ label: "Fluid", chainName: "Ethereum", reason: "no USD price" }]);
});

test("a launched explorer with no row omits the value", () => {
  const restore = quiet();
  const v = settleValueHeld(data([row("aave-v3"), row("maple")], 200), roster);
  restore();
  assert.equal(v, null);
});

test("a total that disagrees by more than a dollar omits the value", () => {
  const restore = quiet();
  const rows = [row("aave-v3"), row("maple"), row("fluid", { counted: false, usd: null })];
  assert.equal(settleValueHeld(data(rows, 205), roster), null);
  restore();
  assert.notEqual(settleValueHeld(data(rows, 200.5), roster), null);
});

test("a counted row without a finite figure is not counted", () => {
  const restore = quiet();
  const v = settleValueHeld(
    data([row("aave-v3"), row("maple", { usd: null }), row("fluid", { counted: false, usd: null })], 100),
    roster,
  );
  restore();
  assert.equal(v.rows.length, 1);
  assert.equal(v.notCounted[0].label, "Maple");
});

test("rows match on slug and chain; the vaults surface reads after the chain", () => {
  const r = [{ id: "morpho-base", slug: "morpho", chainId: 8453, label: "Morpho Blue", chainName: "Base" }];
  const v = settleValueHeld(
    {
      computedAt: "2026-11-02T00:00:00Z",
      totalUsd: 50,
      overlaps: [],
      explorers: [
        { ...row("morpho", { chainId: 8453, counted: false, usd: null, reason: "no price" }) },
        { ...row("morpho", { chainId: 8453, surface: "vaults", usd: 50 }) },
      ],
    },
    r,
  );
  assert.equal(v.rows[0].chainName, "Base vaults");
  assert.deepEqual(v.notCounted, [{ label: "Morpho Blue", chainName: "Base", reason: "no price" }]);
});

test("stale assets read as one line per explorer", () => {
  const lines = groupLeftOut("Spark", "Ethereum", [
    { what: "LBTC", reason: "its price is 4.0 days older than the positions' block (the limit is 24 hours)", usd: 98 },
    { what: "sDAI", reason: "its price is 4.3 days older than the positions' block (the limit is 24 hours)", usd: 2 },
    { what: "SEAM", reason: "a constant", usd: null },
  ]);
  assert.deepEqual(lines, [
    {
      label: "Spark",
      chainName: "Ethereum",
      what: "2 assets",
      usd: 100,
      reason: "a stored price more than 24 hours older than the positions",
    },
    { label: "Spark", chainName: "Ethereum", what: "SEAM", usd: null, reason: "a constant" },
  ]);
});

test("the headline total reads in whole dollars, spoken rounded", () => {
  assert.equal(formatValueHeld(38_410_261_859.4), "$38,410,261,859");
  assert.equal(spokenValueHeld(38_410_261_859), "about 38.4 billion dollars");
  assert.equal(spokenValueHeld(18_400_000), "about 18.4 million dollars");
});
