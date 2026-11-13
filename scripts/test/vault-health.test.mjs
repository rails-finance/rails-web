// lib/vaults/health.ts and its words, lib/vaults/health-words.ts, against
// hand-made series (rails-ops ui-jobs 553).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { vaultHealth, spanOf, yearlyOf } from "../../lib/vaults/health.ts";
import { healthLines, durationText, flooredPct, signedPct, ASSET_DOOR } from "../../lib/vaults/health-words.ts";

const F = { amount: (v) => v.toFixed(1), day: (d) => `day ${d}` };
const END = 20_400;

/** A share price compounding at `yearlyAt(day)`, one read a day. */
function priceSeries(days, yearlyAt, { start = 1_000_000 } = {}) {
  const out = [];
  let p = start;
  for (let d = END - days; d <= END; d++) {
    out.push({ day: d, block: d * 10, raw: String(BigInt(Math.round(p))) });
    p *= 1 + yearlyAt(d) / 365;
  }
  return out;
}
const flat = (days, raw) =>
  Array.from({ length: days + 1 }, (_, k) => ({ day: END - days + k, block: (END - days + k) * 10, raw }));

const base = { family: "metamorpho", tooSmall: false, exit: null, steward: null, price: null, assets: null };
const ctx = (family = "metamorpho") => ({ family, assetSymbol: "USDC", decimals: 6 });
const lines = (input) =>
  Object.fromEntries(healthLines(vaultHealth({ ...base, ...input }), ctx(input.family), F).map((l) => [l.key, l]));

const VERDICTS = /\b(Steady|Uneven|Flat|Growing|Shrinking|Yes|Partly|Safe|Risky|Good|Bad)\b/;

test("spans take the latest read at least n days back, gaps widening them", () => {
  const reads = [
    { day: 100, block: 1, raw: "100" },
    { day: 105, block: 2, raw: "101" },
    { day: 140, block: 3, raw: "102" },
  ];
  assert.equal(spanOf(reads, 30).from.day, 105);
  assert.equal(spanOf(reads, 40).from.day, 100);
  assert.equal(spanOf(reads, 60), null);
});

test("yield: the 30-day figure, the 90, and the three windows' range", () => {
  const price = priceSeries(129, (d) => (d > END - 30 ? 0.06 : 0.04));
  const h = vaultHealth({ ...base, price });
  assert.equal(h.yield.windows.length, 3);
  assert.ok(Math.abs(yearlyOf(h.yield.y30) - 0.06) < 0.002);
  const l = lines({ price });
  assert.match(l.yield.headline, /^(5\.9|6\.\d)% a year over the last 30 days$/);
  assert.match(
    l.yield.sentence,
    /^4\.\d% over 90 days\. Each 30 days of the last 90 earned between 4\.\d% and (5\.9|6\.\d)%\.$/,
  );
});

test("yield: a share price that has not moved, Umbrella's rewards named", () => {
  const price = flat(129, "1000000");
  const l = lines({ price });
  assert.equal(l.yield.headline, "0.0% over 90 days");
  assert.equal(l.yield.sentence, "The share price has not moved in 90 days.");
  const u = lines({ family: "umbrella-stake", price });
  assert.match(u.yield.sentence, /Umbrella pays its rewards outside the share\.$/);
});

test("young series and unread families say so", () => {
  const l = lines({ price: priceSeries(10, () => 0.05), assets: flat(10, "5") });
  assert.equal(l.yield.headline, "Series from day 20390");
  assert.equal(l.size.headline, "Series from day 20390");
  for (const x of Object.values(lines({ family: "maple-pool" }))) assert.equal(x.read, false, x.key);
  assert.equal(lines({}).size.sentence, "The daily store did not answer.");
});

test("size: the change in 30 days, then the two totals", () => {
  const assets = [
    { day: END - 30, block: 1, raw: "414500000" },
    { day: END, block: 2, raw: "401100000" },
  ];
  const l = lines({ assets });
  assert.equal(l.size.headline, "−3.2% in 30 days");
  assert.equal(l.size.sentence, "Held 401.1 USDC at the last read, 414.5 on day 20370.");
  const fresh = lines({ assets: [{ ...assets[0], raw: "0" }, assets[1]] });
  assert.equal(fresh.size.headline, "From nothing in 30 days");
});

test("losses: falls counted, the largest named, lost assets where read", () => {
  const price = priceSeries(129, () => 0.05);
  assert.equal(lines({ price }).losses.headline, "No share-price falls in 90 days");
  const k = price.length - 10;
  const fallen = price.map((r, i) => (i >= k ? { ...r, raw: String((BigInt(r.raw) * 99n) / 100n) } : r));
  const l = lines({ price: fallen, lostAssets: { raw: "2500000", block: 9 } });
  assert.match(l.losses.headline, /^The share price fell on 1 of the last 90 days, the most \u22120\.99% on day \d+$/);
  assert.equal(l.losses.sentence, "Lost assets on record: 2.5 USDC.");
  assert.equal(lines({ price, lostAssets: null }).losses.sentence, "A V1.0 vault keeps no record of lost assets.");
});

test("withdrawals: the holder's figure first, then the vault's", () => {
  const exit = { kind: "queue", block: 5, queueAssets: "1000", withdrawable: "528" };
  const all = lines({ exit, holder: { block: 5, claim: "100000000", maxWithdraw: "100000000" } });
  assert.equal(all.withdrawals.headline, "All of this position could be withdrawn at the last read");
  assert.equal(
    all.withdrawals.sentence,
    "52.8% of the vault's assets withdrawable at the last read. The markets it lends to held that much unborrowed.",
  );
  const part = lines({ exit, holder: { block: 5, claim: "100000000", maxWithdraw: "40000000" } });
  assert.equal(part.withdrawals.headline, "40.0 of this position's 100.0 USDC could be withdrawn at the last read");
  const vaultOnly = lines({ exit: { ...exit, withdrawable: "12" }, caught: "The RLP market holds 98.8%." });
  assert.equal(vaultOnly.withdrawals.headline, "1.2% of the vault's assets withdrawable at the last read");
  assert.equal(
    vaultOnly.withdrawals.sentence,
    "The RLP market holds 98.8%. The markets it lends to held that much unborrowed.",
  );
});

test("withdrawals: a pause leads; Yearn's idle part; Umbrella's cooldown; unread families", () => {
  const p = lines({ family: "sgho", paused: true, holder: { block: 1, claim: "10", maxWithdraw: "0" } });
  assert.equal(p.withdrawals.headline, "Withdrawals are paused");
  const y = lines({ family: "yearn-v3", exit: { kind: "idle", block: 1, idle: "250", total: "1000" } });
  assert.equal(y.withdrawals.headline, "25% of the vault's assets idle at the last read");
  const yh = lines({
    family: "yearn-v3",
    exit: { kind: "idle", block: 1, idle: "0", total: "1000" },
    holder: { block: 1, claim: "100000000", maxWithdraw: "100000000" },
  });
  assert.equal(yh.withdrawals.headline, "All of this position could be withdrawn at the last read");
  assert.equal(
    yh.withdrawals.sentence,
    "0% of the vault's assets idle at the last read. All of them were lent to its strategies, which pay a withdrawal as far as they can free the asset. The figure for this position is the vault's maxWithdraw, which counts what its strategies can free through the withdrawal queue.",
  );
  const u = lines({
    family: "umbrella-stake",
    exit: { kind: "cooldown", block: 1, cooldownSeconds: 20 * 86_400, windowSeconds: 2 * 86_400 },
  });
  assert.equal(u.withdrawals.headline, "A cooldown of 20 days");
  assert.equal(
    u.withdrawals.sentence,
    "A withdrawal starts the cooldown, then must be made within the 2 days after it.",
  );
  const s = lines({ family: "stata" });
  assert.equal(s.withdrawals.read, false);
  assert.equal(s.steward.read, false);
});

test("the steward is the role and the address", () => {
  const l = lines({ steward: { role: "curator", address: "0x9e33aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0585", block: 3 } });
  assert.equal(l.steward.headline, "Curator 0x9e33…0585");
});

test("no line and no door word carries a verdict", () => {
  const price = priceSeries(129, () => 0.05);
  const all = healthLines(
    vaultHealth({ ...base, price, assets: flat(129, "1000000000"), lostAssets: { raw: "0", block: 1 } }),
    ctx(),
    F,
  );
  for (const l of all) assert.doesNotMatch(`${l.headline} ${l.sentence}`, VERDICTS, l.key);
  assert.doesNotMatch(Object.values(ASSET_DOOR.orders).join(" "), VERDICTS);
  assert.equal(ASSET_DOOR.heading("USDC"), "Vaults that take USDC");
  assert.equal(ASSET_DOOR.hidden(54), "Hiding 54 vaults the chain shows as illiquid or with lost assets.");
});

test("numbers: durations, floored shares, signed changes", () => {
  assert.equal(durationText(86_400 * 2 + 3600 * 12), "2 days 12 hours");
  assert.equal(durationText(3600), "1 hour");
  assert.equal(flooredPct(0.99999), "99.9%");
  assert.equal(flooredPct(0.25), "25%");
  assert.equal(signedPct(0.041), "+4.1%");
  assert.equal(signedPct(-0.00001), "0.0%");
});
