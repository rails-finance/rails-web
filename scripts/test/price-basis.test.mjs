// lib/shared/price-basis-words.ts (rails-ops ui-jobs 761): the event card's
// then/today press, one clock before the price row's chips.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { anyFlips, pressState, todayChipTitle, todayChipProv } = await import("../../lib/shared/price-basis-words.ts");

const prices = { weth: { price: 1806 }, bold: { price: 0.9985 } };

test("the press is hidden where no chip can flip", () => {
  assert.equal(anyFlips([], prices), false);
  assert.equal(anyFlips([{ symbol: "WETH" }], undefined), false);
  assert.equal(anyFlips([{ symbol: "wstETH" }], prices), false);
});

test("a chip in another unit does not flip", () => {
  assert.equal(anyFlips([{ symbol: "WETH", noToday: true }], prices), false);
  assert.equal(anyFlips([{ symbol: "WETH", noToday: true }, { symbol: "BOLD" }], prices), true);
});

test("a chip the page prices today flips, by symbol in any case", () => {
  assert.equal(anyFlips([{ symbol: "WETH" }], prices), true);
});

test("the press's name and pressed state at each basis", () => {
  assert.deepEqual(pressState("event"), {
    label: "Prices at this event. Press for the prices at the latest block.",
    pressed: false,
  });
  assert.deepEqual(pressState("today"), {
    label: "Prices at the latest block. Press for the prices at this event.",
    pressed: true,
  });
});

test("a flipped chip's tip says the latest block", () => {
  assert.equal(todayChipTitle("WETH"), "WETH price at the latest block");
});

test("a flipped chip's receipt is the page's read where it publishes one", () => {
  const info = { kind: "chain-derived", summary: "BOLD at the Curve BOLD/USDC pool" };
  assert.equal(todayChipProv("BOLD", info), info);
  assert.equal(todayChipProv("WETH", undefined).summary, "WETH price at the latest block, from its oracle.");
  assert.ok(!todayChipProv("WETH", undefined).summary.includes("Prices chip"));
});
