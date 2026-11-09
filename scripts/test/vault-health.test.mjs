// lib/vaults/health.ts against hand-made series (rails-ops ui-jobs 553).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { vaultHealth, healthLines, spanOf, yearlyOf, durationText, flooredPct } from "../../lib/vaults/health.ts";

const W = { amount: (v) => v.toFixed(1), day: (d) => `day ${d}` };
const END = 20_400;

/** A share price compounding at `yearly` (piecewise by day range), one read a day. */
function priceSeries(days, yearlyAt, { start = 1_000_000n } = {}) {
  const out = [];
  let p = Number(start);
  for (let d = END - days; d <= END; d++) {
    out.push({ day: d, block: d * 10, raw: String(BigInt(Math.round(p))) });
    p *= 1 + yearlyAt(d) / 365;
  }
  return out;
}
const flatAssets = (days, raw) =>
  Array.from({ length: days + 1 }, (_, k) => ({ day: END - days + k, block: (END - days + k) * 10, raw }));

const base = {
  family: "metamorpho",
  assetSymbol: "USDC",
  decimals: 6,
  tooSmall: false,
  exit: null,
  steward: null,
};

test("spans take the latest read at least n days back, gaps widening them", () => {
  const reads = [
    { day: 100, block: 1, raw: "100" },
    { day: 105, block: 2, raw: "101" },
    { day: 140, block: 3, raw: "102" },
  ];
  const s = spanOf(reads, 30);
  assert.equal(s.from.day, 105);
  assert.equal(spanOf(reads, 40).from.day, 100);
  assert.equal(spanOf(reads, 60), null);
});

test("a steady earner: three windows within a quarter of the yield", () => {
  const h = vaultHealth({ ...base, price: priceSeries(129, () => 0.05), assets: flatAssets(129, "1000000000000") }, W);
  assert.equal(h.earning.word, "Steady");
  assert.match(h.earning.sentence, /^5\.\d% a year over 30 days, 5\.\d% over 90\. Each 30 days of the last 90/);
  assert.equal(h.earning.basis.windows.length, 3);
  assert.ok(Math.abs(yearlyOf(h.earning.basis.y30) - 0.05) < 0.002);
  assert.equal(h.size.word, "Steady");
  assert.equal(h.losses.word, "No");
});

test("an uneven earner: the windows spread past the floor", () => {
  const h = vaultHealth({ ...base, price: priceSeries(129, (d) => (d > END - 30 ? 0.12 : 0.03)), assets: null }, W);
  assert.equal(h.earning.word, "Uneven");
  assert.equal(h.size.read, false);
});

test("the one-point floor keeps a small spread steady", () => {
  // 2% then 2.8%: the spread (0.8 points) is over a quarter of the yield but under one point.
  const h = vaultHealth({ ...base, price: priceSeries(129, (d) => (d > END - 30 ? 0.028 : 0.02)), assets: null }, W);
  assert.equal(h.earning.word, "Steady");
});

test("a share price that does not move is Flat, Umbrella's sentence naming why", () => {
  const price = flatAssets(129, "1000000");
  assert.equal(vaultHealth({ ...base, price, assets: null }, W).earning.word, "Flat");
  const u = vaultHealth({ ...base, family: "umbrella-stake", price, assets: null }, W);
  assert.match(u.earning.sentence, /Umbrella pays its rewards outside the share/);
});

test("a young series says when it starts; no series reads as not read", () => {
  const h = vaultHealth({ ...base, price: priceSeries(10, () => 0.05), assets: flatAssets(10, "5") }, W);
  assert.equal(h.earning.word, "Young");
  assert.equal(h.size.word, "Young");
  const none = vaultHealth({ ...base, family: "maple-pool", price: null, assets: null }, W);
  for (const l of healthLines(none)) assert.equal(l.read, false, l.key);
});

test("size: growing, shrinking, and new from zero", () => {
  const grow = [
    { day: END - 30, block: 1, raw: "1000000000" },
    { day: END, block: 2, raw: "1100000000" },
  ];
  const h = vaultHealth({ ...base, price: null, assets: grow }, W);
  assert.equal(h.size.word, "Growing");
  assert.equal(h.size.sentence, "Holds 1100.0 USDC, +10.0% since day 20370 (1000.0).");
  const shrink = [grow[1], { ...grow[0], day: END + 31 }].sort((a, b) => a.day - b.day);
  assert.equal(vaultHealth({ ...base, price: null, assets: shrink }, W).size.word, "Shrinking");
  const fresh = [{ ...grow[0], raw: "0" }, grow[1]];
  assert.equal(vaultHealth({ ...base, price: null, assets: fresh }, W).size.word, "New");
});

test("losses: a fall past 0.1% is Yes, smaller ones are dips, lost assets are named", () => {
  const price = priceSeries(129, () => 0.05);
  const k = price.length - 10;
  const dipped = price.map((r, i) => (i === k ? { ...r, raw: String(BigInt(r.raw) - 200n) } : r));
  assert.equal(vaultHealth({ ...base, price: dipped, assets: null }, W).losses.word, "Small dips");
  const fallen = price.map((r, i) => (i >= k ? { ...r, raw: String((BigInt(r.raw) * 99n) / 100n) } : r));
  const h = vaultHealth({ ...base, price: fallen, assets: null, lostAssets: { raw: "2500000", block: 9 } }, W);
  assert.equal(h.losses.word, "Yes");
  assert.match(h.losses.sentence, /It records 2\.5 USDC of lost assets\.$/);
  const v10 = vaultHealth({ ...base, price, assets: null, lostAssets: null }, W);
  assert.match(v10.losses.sentence, /keeps no lost-assets ledger/);
});

test("exit: MetaMorpho's withdrawable share, the caught sentence first", () => {
  const ok = vaultHealth(
    {
      ...base,
      price: null,
      assets: null,
      exit: { kind: "queue", block: 5, queueAssets: "1000", withdrawable: "1000", caught: null },
    },
    W,
  );
  assert.equal(ok.exit.word, "Yes");
  const part = vaultHealth(
    {
      ...base,
      price: null,
      assets: null,
      exit: { kind: "queue", block: 5, queueAssets: "1000", withdrawable: "990", caught: null },
    },
    W,
  );
  assert.equal(part.exit.word, "Partly");
  assert.match(part.exit.sentence, /^99% of it can leave today/);
  const stuck = vaultHealth(
    {
      ...base,
      price: null,
      assets: null,
      exit: { kind: "queue", block: 5, queueAssets: "1000", withdrawable: "12", caught: "The RLP market holds 98.8%." },
    },
    W,
  );
  assert.equal(stuck.exit.word, "Not all of it");
  assert.equal(stuck.exit.sentence, "The RLP market holds 98.8%. 1.2% of it can leave today.");
});

test("exit: Yearn's idle part, Umbrella's cooldown, and families not read", () => {
  const y = vaultHealth(
    {
      ...base,
      family: "yearn-v3",
      price: null,
      assets: null,
      exit: { kind: "idle", block: 1, idle: "250", total: "1000" },
    },
    W,
  );
  assert.equal(y.exit.word, "Partly");
  assert.match(y.exit.sentence, /^25% of it sits idle/);
  const u = vaultHealth(
    {
      ...base,
      family: "umbrella-stake",
      price: null,
      assets: null,
      exit: { kind: "cooldown", block: 1, cooldownSeconds: 20 * 86_400, windowSeconds: 2 * 86_400 },
    },
    W,
  );
  assert.equal(
    u.exit.sentence,
    "A withdrawal starts a cooldown of 20 days, then must be made within the 2 days after it.",
  );
  const s = vaultHealth({ ...base, family: "stata", price: null, assets: null }, W);
  assert.equal(s.exit.read, false);
  assert.equal(s.steward.read, false);
});

test("the steward is an address, its role in words", () => {
  const h = vaultHealth(
    {
      ...base,
      price: null,
      assets: null,
      steward: { role: "curator", address: "0x1234567890abcdef1234567890abcdef12345678", block: 3 },
    },
    W,
  );
  assert.equal(h.steward.word, "0x1234…5678");
  assert.match(h.steward.sentence, /its curator, which picks the markets/);
});

test("words: durations and floored shares", () => {
  assert.equal(durationText(86_400 * 2 + 3600 * 12), "2 days 12 hours");
  assert.equal(durationText(3600), "1 hour");
  assert.equal(flooredPct(0.99999), "99.9%");
  assert.equal(flooredPct(0.25), "25%");
});
