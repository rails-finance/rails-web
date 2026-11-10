// The share donut's slice colours (lib/shared/slice-colours.ts). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  assetSliceColours,
  COLLISION_DELTA_E,
  cssOf,
  deltaE,
  holderSliceColours,
  inBand,
  OTHER_COLOUR,
  PALETTE,
  SIBLING_DELTA_E,
} from "../../lib/shared/slice-colours.ts";

const pairOf = (css) => {
  const m = /^light-dark\((#[0-9a-f]{6}), (#[0-9a-f]{6})\)$/.exec(css);
  assert.ok(m, `not a light-dark pair: ${css}`);
  return { light: m[1], dark: m[2] };
};
const near = (x, y) => Math.min(deltaE(x.light, y.light), deltaE(x.dark, y.dark));

const ORANGE = "#f7931a"; // a BTC orange
const BLUE = "#2775ca"; // a USDC blue
const BLUE_2 = "#0052ff"; // a Coinbase blue

test("holders take the palette in order, the rest grey", () => {
  const out = holderSliceColours([{}, {}, {}, { rest: true }]);
  assert.deepEqual(out, [cssOf(PALETTE[0]), cssOf(PALETTE[1]), cssOf(PALETTE[2]), OTHER_COLOUR]);
});

test("holders past the palette never repeat a colour", () => {
  const out = holderSliceColours(Array.from({ length: PALETTE.length + 2 }, () => ({})));
  assert.equal(new Set(out).size, out.length);
});

test("a token keeps its colour, brought into the band", () => {
  const [btc] = assetSliceColours([{ token: "btc", colour: ORANGE }]);
  assert.deepEqual(pairOf(btc), inBand(ORANGE));
  assert.ok(near(pairOf(btc), { light: ORANGE, dark: ORANGE }) < 10);
});

test("a colour too near one given takes the next palette colour that clears all", () => {
  const out = assetSliceColours([
    { token: "usdc", colour: BLUE },
    { token: "cbbtc", colour: BLUE_2 },
  ]).map(pairOf);
  assert.ok(near(inBand(BLUE), inBand(BLUE_2)) < COLLISION_DELTA_E, "fixture: the two blues collide");
  assert.deepEqual(out[0], inBand(BLUE));
  // Palette blue collides with USDC too, so orange is next.
  assert.deepEqual(out[1], PALETTE[1]);
  assert.ok(near(out[0], out[1]) >= COLLISION_DELTA_E);
});

test("a token with no colour falls back to the palette", () => {
  const out = assetSliceColours([{ token: "weth", colour: null }, { token: "x" }]);
  assert.deepEqual(out, [cssOf(PALETTE[0]), cssOf(PALETTE[1])]);
});

test("two slices of one token share its hue a visible step apart", () => {
  const out = assetSliceColours([
    { token: "cbbtc", colour: BLUE_2 },
    { token: "cbbtc", colour: BLUE_2 },
  ]).map(pairOf);
  assert.notDeepEqual(out[0], out[1]);
  assert.ok(near(out[0], out[1]) >= SIBLING_DELTA_E);
  assert.ok(near(out[0], out[1]) < COLLISION_DELTA_E + 10, "still reads as the same hue family");
});

test("the rest is grey and every coloured slice stays apart", () => {
  const out = assetSliceColours([
    { token: "usdc", colour: BLUE },
    { token: "wbtc", colour: ORANGE },
    { token: "none", colour: null },
    { rest: true },
  ]);
  assert.equal(out.at(-1), OTHER_COLOUR);
  const pairs = out.slice(0, -1).map(pairOf);
  for (let i = 0; i < pairs.length; i++)
    for (let j = i + 1; j < pairs.length; j++)
      assert.ok(near(pairs[i], pairs[j]) >= COLLISION_DELTA_E, `${i}↔${j} ${near(pairs[i], pairs[j]).toFixed(1)}`);
});

test("when no palette colour clears the floor, the farthest unused one is taken", () => {
  const out = assetSliceColours([
    { token: "usdc", colour: BLUE },
    { token: "wbtc", colour: ORANGE },
    { token: "cbbtc", colour: BLUE_2 },
    { token: "btc", colour: "#f89520" },
  ]).map(pairOf);
  assert.equal(new Set(out.map((p) => p.light)).size, 4);
  const minTo = (p, given) => Math.min(...given.map((g) => near(p, g)));
  const used = out.slice(0, 3);
  for (const p of PALETTE)
    if (!used.some((u) => u.light === p.light)) assert.ok(minTo(out[3], used) >= minTo(p, used) - 1e-9);
});
