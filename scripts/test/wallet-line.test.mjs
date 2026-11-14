// lib/wallet/summary-counts.ts walletLineText: the wallet heading's count line (H13.2) names its
// scope, "On Rails:" where the page's position is among those counted and "Also on Rails:" where it
// is not (Miles 12 Nov 2026, rails-ops ui-jobs 613), and names the protocols counted (Miles 13 Nov
// 2026, ui-jobs 639).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { walletLineText } from "../../lib/wallet/summary-counts.ts";

const row = (chain, status, i) => ({
  chain,
  family: "aave-v3",
  positionId: String(i),
  status,
  href: `/${chain}/aave-v3/${i}`,
});

const FIVE = [
  row("ethereum", "open", 1),
  row("ethereum", "open", 2),
  row("ethereum", "closed", 3),
  row("base", "liquidated", 4),
  row("base", "closed", 5),
];

test("the page's position counted: On Rails", () => {
  assert.equal(walletLineText(FIVE, true), "On Rails: 5 positions on 2 chains · 2 open · 3 closed");
});

test("the page's position not counted: Also on Rails", () => {
  assert.equal(walletLineText(FIVE.slice(2), false), "Also on Rails: 3 positions on 2 chains · 0 open · 3 closed");
});

test("one chain is not named", () => {
  assert.equal(walletLineText(FIVE.slice(0, 2), true), "On Rails: 2 positions · 2 open · 0 closed");
});

test("nothing counted draws nothing", () => {
  assert.equal(walletLineText([], false), null);
});

const NAMES = {
  "aave-v3": "Aave V3",
  "liquity-v2": "Liquity V2",
  morpho: "Morpho Blue",
  spark: "SparkLend",
  fluid: "Fluid",
};
const nameOf = (p) => NAMES[p.family];
const fam = (family, status, i, chain = "ethereum") => ({ ...row(chain, status, i), family });

test("one position names its protocol and state", () => {
  assert.equal(
    walletLineText([row("ethereum", "closed", 1)], false, nameOf),
    "Also on Rails: 1 Aave V3 position · closed",
  );
  assert.equal(walletLineText([row("ethereum", "open", 1)], true, nameOf), "On Rails: 1 Aave V3 position · open");
});

test("one protocol, several positions", () => {
  assert.equal(walletLineText(FIVE, true, nameOf), "On Rails: 5 Aave V3 positions on 2 chains · 2 open · 3 closed");
});

test("two or three protocols are named, most positions first", () => {
  const rows = [fam("liquity-v2", "open", 1), fam("aave-v3", "closed", 2), fam("aave-v3", "closed", 3)];
  assert.equal(
    walletLineText(rows, false, nameOf),
    "Also on Rails: 3 positions in Aave V3 and Liquity V2 · 1 open · 2 closed",
  );
  assert.equal(
    walletLineText([...rows, fam("morpho", "open", 4, "arbitrum")], false, nameOf),
    "Also on Rails: 4 positions in Aave V3, Liquity V2 and Morpho Blue on 2 chains · 2 open · 2 closed",
  );
});

test("past three protocols the line counts them", () => {
  const rows = ["aave-v3", "liquity-v2", "morpho", "spark"].map((f, i) => fam(f, "open", i));
  assert.equal(walletLineText(rows, true, nameOf), "On Rails: 4 positions in 4 protocols · 4 open · 0 closed");
});

test("a position with no name leaves the line unnamed", () => {
  const rows = [row("ethereum", "open", 1), fam("unknown", "closed", 2)];
  assert.equal(walletLineText(rows, false, nameOf), "Also on Rails: 2 positions · 1 open · 1 closed");
});
