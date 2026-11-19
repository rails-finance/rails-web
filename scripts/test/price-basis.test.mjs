// lib/shared/price-basis-words.ts (rails-ops ui-jobs 761): the event card's
// then/today press, one clock before the price row's chips.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { anyFlips, clockClass, pressState, todayChipTitle, todayChipProv } = await import(
  "../../lib/shared/price-basis-words.ts"
);

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

test("the group's name, tip and pressed state at each basis", () => {
  assert.deepEqual(pressState("event"), {
    label: "Prices at this event. Press for the prices at the latest block.",
    pressed: false,
  });
  assert.deepEqual(pressState("today"), {
    label: "Prices at the latest block. Press for the prices at this event.",
    pressed: true,
  });
});

test("at the event's prices the clock is hidden at rest, shown on the group's hover and on keyboard focus", () => {
  const c = clockClass("event").split(" ");
  assert.ok(c.includes("opacity-0"));
  assert.ok(c.includes("group-hover/price:opacity-100"));
  assert.ok(c.includes("focus-visible:opacity-100"));
});

test("on a device without hover the clock is always shown", () => {
  assert.ok(clockClass("event").split(" ").includes("[@media(hover:none)]:opacity-100"));
});

test("the clock is muted at both bases", () => {
  for (const basis of ["event", "today"]) {
    const c = clockClass(basis).split(" ");
    assert.ok(c.includes("text-rb-500"));
    assert.ok(!c.some((x) => x.includes("green")));
  }
});

test("at the latest block's prices the clock is always shown", () => {
  assert.ok(!clockClass("today").includes("opacity-0"));
  assert.ok(clockClass("today").split(" ").includes("opacity-100"));
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
