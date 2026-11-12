// lib/wallet/summary-counts.ts walletLineText: the wallet heading's count line (H13.2) names its
// scope, "On Rails:" where the page's position is among those counted and "Also on Rails:" where it
// is not (Miles 12 Nov 2026, rails-ops ui-jobs 613).
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
