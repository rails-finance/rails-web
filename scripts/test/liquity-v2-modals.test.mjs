// Liquity V2's "?" modals name the open branch's Max LTV (rails-ops ui-jobs 589):
// the adjust modal reads 90.91% on WETH (MCR 110%) and 83.33% on wstETH and rETH
// (MCR 120%), and stays a sentence on a branch Rails does not know.
// Run: npm test
//
// The loader imports through `@/` and reads a `.yaml` file (scripts/lib/app-resolver.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const { L5 } = await import("../../lib/liquity/event-templates.ts");

const maxLtvSentence = (c) => c.extraParagraphs.find((p) => /Max LTV/.test(p));

test("the adjust modal states the open branch's Max LTV", () => {
  assert.match(maxLtvSentence(L5.adjust({ collateralType: "WETH" })), /Max LTV \(90\.91% for WETH\)/);
  for (const t of ["wstETH", "rETH"])
    assert.match(maxLtvSentence(L5.adjust({ collateralType: t })), new RegExp(`Max LTV \\(83\\.33% for ${t}\\)`));
});

test("the adjust modal stays a sentence without a known branch", () => {
  const s = maxLtvSentence(L5.adjust({}));
  assert.doesNotMatch(s, /[{}]|\d+\.\d+%/);
  assert.match(s, /Max LTV \(set per branch for this collateral\)/);
});

test("the liquidation modal reads the same figure", () => {
  assert.match(L5.liquidation({ collateralType: "rETH" }).intro, /Max LTV of 83\.33% for rETH/);
});
