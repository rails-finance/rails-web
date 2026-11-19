// The Aave family's flow legs carry their parts (rails-ops ui-jobs 743): each
// leg's price as shown at its event's block, named as the market's oracle;
// a leg with no price at its block is unpriced, with no fallback to today's
// price; the legs rebuild their line to the cent.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    if (!existsSync(fileURLToPath(url)) || statSync(fileURLToPath(url)).isDirectory()) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(fileURLToPath(url + ext))) { url += ext; break; }
      }
    }
    return next(url, ctx);
  }
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

const { focusEventsFromLegs } = await import(ROOT + "lib/aave-v3/flows-timeline.ts");
const { aaveV3PriceNote } = await import(ROOT + "lib/aave-v3/price-notes.ts");
const { shownUsd } = await import(ROOT + "lib/shared/shown-usd.ts");
const { legsProv } = await import(ROOT + "lib/shared/flows-timeline-provenance.ts");

const WBTC = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
const ev = (id, block, legs) => ({ id, blockNumber: block, timestamp: 1_700_000_000 + block, txHash: `0x${id}`, legs });
const EVENTS = [
  ev("a", 100, [{ symbol: "WBTC", address: WBTC, leg: "supplied", amount: 1.2345678, price: 98_765.43218765 }]),
  ev("b", 200, [{ symbol: "WBTC", address: WBTC, leg: "supplied", amount: 0.5 }]),
];
const note = (l, block) => aaveV3PriceNote("the market's AaveOracle", l.symbol, block);

test("an Aave leg carries its price at its block, named; one with no price there is unpriced", () => {
  const focus = focusEventsFromLegs(EVENTS, (e) => e.legs, { [WBTC]: 90_000 }, note);
  const [a] = focus[0].legs;
  assert.equal(a.usd, shownUsd(1.2345678, 98_765.43218765));
  assert.equal(a.block, 100);
  assert.equal(a.priceNote, "the market's AaveOracle getAssetPrice(WBTC) at block 100, USD with 8 decimals");
  const [b] = focus[1].legs;
  assert.equal(b.price, null, "today's price is no price at its block");
  assert.equal(b.usd, null);
  const prov = legsProv("Supplied", "now", [a]);
  assert.match(prov.inputs.find((i) => i.label === "WBTC at block 100 price").note, /block 100/);
});

test("without a price note the legs keep their raw figures (the adapter)", () => {
  const focus = focusEventsFromLegs(EVENTS, (e) => e.legs, { [WBTC]: 90_000 });
  assert.equal(focus[1].legs[0].usd, 0.5 * 90_000);
  assert.equal(focus[1].legs[0].price, undefined);
});

// ── Aave V3 on Base: prices not read at a leg's block, both blocks named ──
const { readFileSync } = await import("node:fs");
const { aaveBaseReplay, aaveBaseFocusEvents, aaveBaseFlowTimeline } = await import(ROOT + "lib/aave-v3-base/flows.ts");
const { dailyPricesFromAnswer, dailyBlocksFromAnswer } = await import(ROOT + "lib/api/fetch-daily-prices.ts");
const { buildFlowModel, partialAt } = await import(ROOT + "lib/shared/flows-timeline.ts");
const FIX = JSON.parse(readFileSync(REPO + "/scripts/verify/fixtures/aave-v3-base-flows.json", "utf8"));
const fixture = (name) => FIX.fixtures.find((f) => f.name === name);
function baseOpts(f, { store = true, today = true } = {}) {
  const strip = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.slice(k.indexOf(":") + 1), v]));
  return {
    now: FIX.readAt,
    live: null,
    todayPrices: today ? Object.fromEntries(Object.entries(f.prices).map(([a, p]) => [a.toLowerCase(), p])) : {},
    brand: "Aave",
    writeOffFrom: null,
    todayBlock: 30_000_000,
    ...(store
      ? { dailyPrices: strip(dailyPricesFromAnswer(f.daily)), dailyBlocks: strip(dailyBlocksFromAnswer(f.daily)) }
      : {}),
  };
}
const legsOf = (f, o) => aaveBaseFocusEvents(aaveBaseReplay(f.events, o), "Aave").flatMap((e) => e.legs);
const BOTH = (from) => new RegExp(`price at block [\\d,]+, ${from}; this event is at block [\\d,]+$`);

test("Base: a leg at the day's close keeps that price and names both blocks", () => {
  const f = fixture("aave-liquidated-six");
  const l = legsOf(f, baseOpts(f)).find(
    (x) => x.priceNote.includes("the day's close") && !x.priceNote.includes("does not name"),
  );
  assert.ok(l, "a day-close leg with its store block");
  assert.match(l.priceNote, BOTH("the day's close"));
  assert.equal(l.usd, shownUsd(l.amount, l.price));
});

test("Base: a leg at the nearest read keeps that price and names both blocks", () => {
  const f = fixture("aave-liquidated-six");
  const l = legsOf(f, baseOpts(f, { store: false })).find((x) => x.priceNote.includes("the nearest read"));
  assert.ok(l);
  assert.match(l.priceNote, BOTH("the nearest read"));
  assert.ok(l.usd != null);
});

test("Base: a past event at today's price names both blocks and is not complete; Market move has no figure beside it", () => {
  const f = fixture("aave-liquidated-swaps");
  const o = baseOpts(f, { store: false });
  const l = legsOf(f, o).find((x) => x.priceNote.includes("the latest read"));
  assert.ok(l, "a leg at the latest read's price");
  assert.match(l.priceNote, /price at block 30,000,000, the latest read; this event is at block [\d,]+$/);
  assert.equal(l.basis, "the latest read's price");
  const m = buildFlowModel(aaveBaseFlowTimeline(aaveBaseReplay(f.events, o), o));
  const reasons = [];
  for (let stop = 0; stop <= m.liveStop; stop++)
    for (const s of ["collateral", "debt"]) reasons.push(...partialAt(m, stop, s));
  assert.ok(
    reasons.some((r) => r.includes("priced at the latest block's oracle price")),
    "under Not complete",
  );
});

test("Base: a leg with no price anywhere is unpriced", () => {
  const f = fixture("aave-liquidated-swaps");
  const l = legsOf(f, baseOpts(f, { store: false, today: false })).find((x) => x.price == null);
  assert.ok(l);
  assert.equal(l.usd, null);
});
