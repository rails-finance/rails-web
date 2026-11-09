// lib/shared/aave-reserve-config-explain.ts: an Aave V3 reserve's configuration
// changes explained, one row at a time, on rows shaped as
// GET /api/aave-v3/reserve-config-log gives them.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { compactFigure } from "../../lib/shared/compact-figure.ts";
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
const out = reserveChangesExplained(changes, { symbol: "USDC", compact: compactFigure });
const head = (i) => [out[i].headline, out[i].figure ?? ""].join("|");

test("the head names what moved, with the figure", () => {
  assert.equal(head(0), "eMode category none → ETH correlated (1)|");
  assert.equal(head(1), "Borrowing turned off|");
  assert.equal(head(2), "Frozen|");
  assert.equal(head(3), "Reserve factor raised|10% → 15%");
  assert.equal(head(4), "Borrow cap removed|2M USDC → no cap");
  assert.equal(head(5), "Supply cap raised|1M → 1.5M USDC");
  assert.equal(head(6), "LTV lowered|77% → 75%");
  assert.equal(head(7), "Collateral terms set|");
});

test("the bullets say what the setting does and what the change means", () => {
  assert.equal(
    out[0].bullets[1],
    "Borrowers who choose eMode category 1 count USDC at the category's LTV and liquidation threshold, and can borrow it there.",
  );
  assert.deepEqual(out[3].bullets, [
    "The reserve factor is the share of borrowers' interest that goes to the Aave treasury.",
    "At 15%, USDC suppliers earn 85% of the interest borrowers pay.",
  ]);
  assert.deepEqual(out[5].bullets, [
    "The supply cap is the most USDC the Pool takes in, across every supplier.",
    "Raising the supply cap by 500K, to 1.5M USDC, adds that much room for supply.",
  ]);
  assert.deepEqual(out[6].bullets, [
    "The LTV is the most a borrower can borrow against USDC, as a share of its value.",
    "At 75%, each $100 of USDC supports up to $75 of borrowing.",
  ]);
});

// The eMode kinds, newest first; category 47 is labelled by its category row.
const CAT = "PT-srUSDe Stablecoins (47)";
const tx = (b) => `0x${b.toString(16)}`;
const emode = [
  { row: row(29, "emode-isolation", { categoryId: 47, isolated: true }), words: `eMode ${CAT} isolated: on` },
  {
    row: row(29, "category", { categoryId: 47, ltv: 9000, lt: 9200, bonus: 10403, label: "PT-srUSDe Stablecoins" }),
    words: `eMode ${CAT}: liquidation bonus 4.08% → 4.03%`,
  },
  { row: row(28, "emode-ltvzero", { categoryId: 47, ltvzero: true }), words: `LTV zero in eMode ${CAT}: on` },
  { row: row(27, "emode-borrowable", { categoryId: 47, borrowable: false }), words: `Borrowable in eMode ${CAT}: off` },
  { row: row(26, "emode-borrowable", { categoryId: 47, borrowable: true }), words: `Borrowable in eMode ${CAT}: on` },
  { row: row(25, "emode-collateral", { categoryId: 47, collateral: true }), words: `Collateral in eMode ${CAT}: on` },
  { row: row(24, "asset-category", { from: 0, to: 47 }), words: `eMode category none → ${CAT}` },
  { row: row(23, "emode-isolation", { categoryId: 47, isolated: true }), words: `eMode ${CAT} isolated: on` },
  {
    row: row(23, "category", { categoryId: 47, ltv: 9000, lt: 9200, bonus: 10408, label: "PT-srUSDe Stablecoins" }),
    words: `eMode ${CAT} set: LTV 90%, LT 92%, liquidation bonus 4.08%`,
  },
];
assert.equal(emode[0].row.txHash, tx(29));
const ex = reserveChangesExplained(emode, { symbol: "USDC", compact: compactFigure });
const EMODE_WHAT =
  "An eMode category is a set of assets with its LTV, liquidation threshold and liquidation bonus; a borrower who chooses the category borrows on those terms.";

test("a category's first terms, then a move of one of them", () => {
  assert.deepEqual(ex[8].bullets, [
    EMODE_WHAT,
    `For borrowers in ${CAT}, each $100 of the category's collateral supports up to $90 of borrowing.`,
    `For borrowers in ${CAT}, each $100 of the category's collateral counts as $92 toward the health factor.`,
    `A liquidator of a position in ${CAT} takes 4.08% extra of the category's collateral over the debt repaid.`,
  ]);
  assert.deepEqual(ex[1].bullets, [
    `A liquidator of a position in ${CAT} takes 4.03% extra of the category's collateral over the debt repaid.`,
  ]);
  assert.equal(ex[1].headline, `eMode ${CAT}: liquidation bonus 4.08% → 4.03%`);
});

test("isolation: first written, then restated with the category's terms", () => {
  assert.equal(ex[7].headline, `eMode ${CAT} isolated: on`);
  assert.deepEqual(ex[7].bullets, [
    `${CAT} is isolated: for its borrowers, only the category's collateral supports borrowing.`,
  ]);
  assert.equal(ex[0].headline, `eMode ${CAT} isolated: on, restated`);
  assert.equal(
    ex[0].bullets[0],
    "Each update to a category's terms writes its isolation again, in the same transaction.",
  );
});

test("an asset joining a category, as collateral and as a borrowable asset", () => {
  assert.deepEqual(ex[6].bullets, [
    EMODE_WHAT,
    `Borrowers who choose ${CAT} count USDC at the category's LTV and liquidation threshold, and can borrow it there.`,
  ]);
  assert.equal(
    ex[5].bullets[1],
    `Borrowers who choose ${CAT} count USDC as collateral at the category's LTV and liquidation threshold.`,
  );
  assert.equal(ex[4].bullets[1], `Borrowers who choose ${CAT} can borrow USDC.`);
  assert.equal(
    ex[3].bullets[1],
    `Borrowers in ${CAT} can take no new USDC loans; open loans stay open and can be repaid.`,
  );
});

test("LTV zero in a category", () => {
  assert.deepEqual(ex[2].bullets, [
    `For borrowers in ${CAT}, USDC supports no borrowing and still counts toward the health factor.`,
    `A borrower in ${CAT} holding USDC with other collateral must withdraw the USDC first.`,
  ]);
});

test("isolation off: first written, and turned off", () => {
  const rows = [
    { row: row(42, "emode-isolation", { categoryId: 44, isolated: false }), words: "eMode category 44 isolated: off" },
    { row: row(41, "emode-isolation", { categoryId: 44, isolated: true }), words: "eMode category 44 isolated: on" },
    { row: row(40, "emode-isolation", { categoryId: 45, isolated: false }), words: "eMode category 45 isolated: off" },
  ];
  const got = reserveChangesExplained(rows, { symbol: "USDC", compact: compactFigure });
  assert.deepEqual(got[0].bullets, [
    "eMode category 44 is no longer isolated: its borrowers count collateral outside the category at its reserve's LTV again.",
  ]);
  assert.deepEqual(got[2].bullets, [
    "A borrower in eMode category 45 counts collateral outside the category at its reserve's LTV.",
  ]);
});
