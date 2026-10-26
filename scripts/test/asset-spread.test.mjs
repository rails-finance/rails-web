// The spread between an asset page's lines (lib/shared/asset-spread.ts;
// rails-ops reference/asset-key-map.md, "The spread"). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { fmtSignedSpread, fmtSpread, gapSince, lineSpreads, SPREAD_LIMIT } from "../../lib/shared/asset-spread.ts";

const main = {
  key: "main",
  points: [
    [100, 1.0, 1000],
    [101, 0.9555, 2000],
    [102, 1.0, 3000],
  ],
};

test("a day compares two lines only where their reads are within ten minutes", () => {
  const near = {
    key: "near",
    points: [
      [100, 1.0, 1010],
      [101, 0.9691, 2196],
      [102, 1.0, 3049],
    ],
  };
  const [s] = lineSpreads(main, [near], 1);
  assert.deepEqual([...s.byDay.keys()], [100, 102], "196 blocks on Ethereum is 39 minutes: day 101 is left out");
  assert.equal(s.passes, false);
  const [b] = lineSpreads(main, [near], 8453);
  assert.ok(b.byDay.has(101), "on Base the window is 300 blocks");
});

test("a fixed price compares whatever block it was read at, and names its gap", () => {
  const fixed = {
    key: "maker",
    fixed: true,
    points: [
      [100, 1, 900],
      [101, 1, 2240],
      [102, 1, 3500],
    ],
  };
  const [s] = lineSpreads(main, [fixed], 1);
  assert.equal(s.byDay.size, 3);
  assert.equal(s.passes, true);
  assert.equal(s.largest.day, 101);
  assert.ok(Math.abs(s.largest.dev - (1 / 0.9555 - 1)) < 1e-12);
  assert.deepEqual(gapSince(s, 102), null);
  assert.equal(gapSince(s, 90).day, 101);
});

test("the limit and the words", () => {
  assert.equal(SPREAD_LIMIT, 0.01);
  assert.equal(fmtSpread(0.008), "0.8 %");
  assert.equal(fmtSpread(0.0466), "4.7 %");
  assert.equal(fmtSpread(0.0002), "0.02 %");
  assert.equal(fmtSpread(0.5358), "54 %");
  assert.equal(fmtSpread(0.2), "20 %");
  assert.equal(fmtSpread(0.01), "1 %");
  assert.equal(fmtSpread(0), "0 %");
  assert.equal(fmtSignedSpread(-0.008), "−0.8 %");
  assert.equal(fmtSignedSpread(0), "0 %");
});
