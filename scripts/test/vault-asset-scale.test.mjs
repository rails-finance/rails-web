// lib/vaults/asset-scale-words.ts: the decimals-disagree reading and the
// words every withheld amount carries (rails-ops ui-jobs 664), and the
// health readout's Size line where the amounts are withheld.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  assetScaleAbsentTip,
  assetScaleReceiptNote,
  assetScaleSentence,
  impliedDecimals,
  withScaleNote,
} from "../../lib/vaults/asset-scale-words.ts";
import { vaultHealth } from "../../lib/vaults/health.ts";
import { healthLines } from "../../lib/vaults/health-words.ts";

// wUSDL as Coinshift USDL's asset reads it: 6 decimals stated, and 10^18 of
// its units converting to about 1.0137 USDG (18 decimals).
const WUSDL = {
  stated: 6,
  implied: 18,
  wraps: { address: "0x0", symbol: "USDG", decimals: 18 },
  per1e18: "1013700000000000000",
};

test("the implied decimals: a trillion apart is marked, a wrapper that agrees is not", () => {
  assert.equal(impliedDecimals(6, 18, BigInt(WUSDL.per1e18)), 18);
  // waEthUSDC: 6 decimals, 10^18 units convert to about 1.19e18 USDC units.
  assert.equal(impliedDecimals(6, 6, BigInt("1190000000000000000")), null);
  assert.equal(impliedDecimals(6, 18, BigInt(0)), null);
});

test("the withheld amount's tip says why, once, in plain words", () => {
  assert.equal(
    assetScaleAbsentTip("wUSDL", WUSDL),
    "wUSDL states 6 decimals, but converts to USDG at 18. Read at 6, an amount in wUSDL comes out a trillion times too large, so none is shown.",
  );
  assert.match(assetScaleSentence("wUSDL", WUSDL), /a trillion times too large\.$/);
});

test("a receipt keeps its read and adds the one sentence", () => {
  const note = assetScaleReceiptNote("wUSDL", WUSDL);
  assert.equal(
    note,
    "wUSDL states 6 decimals but converts to USDG at 18, so an amount in wUSDL here, read at 6, is a trillion times too large.",
  );
  const p = { kind: "chain", summary: "Total assets — `totalAssets()` at block 1." };
  assert.equal(withScaleNote(p, note).summary, `${p.summary} ${note}`);
  assert.equal(withScaleNote(p, note).kind, "chain");
  assert.equal(withScaleNote(p, null), p);
  assert.equal(withScaleNote(p, undefined), p);
});

test("the Size line states the reason in place of the totals", () => {
  const assets = [
    { day: 20_370, block: 1, raw: "35269908159786510134142" },
    { day: 20_400, block: 2, raw: "34539480985816148149959" },
  ];
  const health = vaultHealth({
    family: "metamorpho",
    price: null,
    assets,
    tooSmall: false,
    holder: null,
    exit: null,
    steward: null,
  });
  const words = { amount: (v) => v.toFixed(1), day: (d) => `day ${d}` };
  const reason = assetScaleAbsentTip("wUSDL", WUSDL);
  const withheld = healthLines(
    health,
    { family: "metamorpho", assetSymbol: "wUSDL", decimals: 6, amountsWithheld: reason },
    words,
  );
  const size = withheld.find((l) => l.key === "size");
  assert.equal(size.headline, null);
  assert.equal(size.sentence, reason);
  assert.equal(size.read, false);
  const shown = healthLines(health, { family: "metamorpho", assetSymbol: "wUSDL", decimals: 6 }, words);
  assert.match(shown.find((l) => l.key === "size").sentence, /^Held .* wUSDL on day 20400, .* on day 20370\.$/);
});
