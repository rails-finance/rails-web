// The shared event ledger and Lifetime flows in cents (rails-ops ui-jobs 743):
// a leg carries its amount, its price as shown, the price's block and source,
// and its dollars the product of the two as shown, to the cent; a line is the
// sum of its legs' cents and its receipt lists every leg; a line holding an
// unpriced leg draws no figure; Market move is the held figure less the
// lines in cents, with no figure where the two stand on different bases.
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

const { flowLeg, daysFromEvents, buildFlowModel, stateAt } = await import(ROOT + "lib/shared/flows-timeline.ts");
const { sideSumRows, wholeUsd, noPriceWords } = await import(ROOT + "lib/shared/flows-sum.ts");
const { eventCum, eventSideSum, eventTokenSum } = await import(ROOT + "lib/shared/flow-focus.ts");
const { tokenLedger, dollarLedger, ledgerAdds, ledgerAtPrice } = await import(ROOT + "lib/shared/event-ledger.ts");
const { flowSegmentProv, legsProv, marketMoveProv } = await import(ROOT + "lib/shared/flows-timeline-provenance.ts");
const { shownUsd, roundAway, centsOf } = await import(ROOT + "lib/shared/shown-usd.ts");
const { holderUsdReceipt } = await import(ROOT + "lib/shared/holder-usd-receipt.ts");

const DAY = 86_400;
const T0 = 20_000 * DAY;
const BUCKETS = [
  { key: "dep", label: "Deposited", event: "Deposit", side: "collateral", dir: "in" },
  { key: "wd", label: "Withdrawn", event: "Withdraw", side: "collateral", dir: "out" },
  { key: "bor", label: "Borrowed", event: "Borrow", side: "debt", dir: "in" },
];
const note = (b) => `the oracle's price at block ${b.toLocaleString("en-US")}`;
const leg = (bucket, amount, price, block, extra = {}) =>
  flowLeg({ bucket, amount, symbol: "WBTC", price, block, priceNote: note(block), ...extra });

/** Two deposits (one a 7-decimal amount at a high price) and a withdrawal. */
function history({ unpriced = false, basis } = {}) {
  const legs = [
    [leg("dep", 1.2345678, 98_765.43218765, 1001, basis ? { basis: "min" } : {})],
    [leg("dep", 0.5, unpriced ? null : 90_000.123456, 1002, basis ? { basis: "anchor" } : {})],
    [leg("wd", 0.25, 95_000.5, 1003, basis ? { basis: "anchor" } : {})],
  ];
  return legs.map((l, i) => ({
    id: `e${i}`,
    ts: T0 + i * DAY + 10,
    block: 1001 + i,
    tick: "collateral",
    legs: l,
    balances: [],
    prices: [],
  }));
}
const HELD = 1.2345678 + 0.5 - 0.25;

function model(events, words) {
  return buildFlowModel({
    buckets: BUCKETS,
    days: daysFromEvents(
      BUCKETS.map((b) => b.key),
      events,
    ),
    live: { collateralUsd: 0, debtUsd: 0 },
    ...(words ? { words } : {}),
  });
}
const focus = (events) =>
  events.map((e) => ({
    id: e.id,
    ts: e.ts,
    legs: e.legs,
    sides: {
      collateral: { before: 0, after: 0, amount: 0, symbol: "WBTC", held: HELD },
      debt: { before: 0, after: 0, amount: 0, symbol: "USDC", held: 0 },
    },
  }));

const num = (t) => Number(String(t).replace(/[^0-9.]/g, ""));
/** Multiply each printed amount by its printed price, to the cent, and add. */
function rebuild(prov) {
  const byLabel = new Map(prov.inputs.map((i) => [i.label, i.value]));
  const legs = prov.inputs.filter((i) => i.label.endsWith(" amount")).map((i) => i.label.slice(0, -" amount".length));
  let sum = 0;
  for (const l of legs) sum += Math.round(num(byLabel.get(`${l} amount`)) * num(byLabel.get(`${l} price`)) * 100);
  if (legs.length > 1) assert.equal(Math.round(num(byLabel.get("sum")) * 100), sum, "the sum row");
  return { cents: sum / 100, legs };
}

test("legs rebuild to the cent, a 7-decimal amount at a high price among them", () => {
  const l = leg("dep", 1.2345678, 98_765.43218765, 1001);
  assert.equal(l.usd, shownUsd(1.2345678, 98_765.43218765));
  assert.equal(l.usd, 121_932.64, "1.234568 × $98,765.432188, to the cent");
  const m = model(history());
  const st = stateAt(m, m.rows.at(-1).day);
  const dep = st.collateral.sources.find((s) => s.key === "dep");
  const want = Math.round((shownUsd(1.2345678, 98_765.43218765) + shownUsd(0.5, 90_000.123456)) * 100) / 100;
  assert.equal(dep.value, want, "the line is the sum of its legs' cents");
  const r = rebuild(flowSegmentProv(dep, "collateral", "5 Jul '25", false));
  assert.equal(r.cents, want, "the receipt multiplies out to the line");
});

test("the receipt lists every leg with its block, largest first", () => {
  const m = model(history());
  const st = stateAt(m, m.rows.at(-1).day);
  const dep = st.collateral.sources.find((s) => s.key === "dep");
  const prov = flowSegmentProv(dep, "collateral", "5 Jul '25", false);
  const { legs } = rebuild(prov);
  assert.deepEqual(legs, ["WBTC at block 1,001", "WBTC at block 1,002"]);
  assert.match(prov.inputs.find((i) => i.label === "WBTC at block 1,002 price").note, /block 1,002/);
  // Two legs on one block are told apart.
  const twin = legsProv("Deposited", "now", [leg("dep", 1, 10, 7), leg("dep", 2, 10, 7)]);
  assert.ok(twin.inputs.some((i) => i.label === "WBTC at block 7 (2) amount"));
});

test("a leg under a cent sits behind the dust control", () => {
  const prov = legsProv("Deposited", "now", [leg("dep", 2, 50, 1), leg("dep", 0.000001, 3, 2)]);
  const dust = prov.inputs.filter((i) => i.dust);
  assert.ok(dust.length > 0 && dust.every((i) => i.label.startsWith("WBTC at block 2")));
});

test("a line with an unpriced leg draws no figure and names the asset; no partial sum", () => {
  const unpriced = leg("dep", 0.5, null, 1002);
  assert.equal(unpriced.usd, null, "never $0");
  const m = model(history({ unpriced: true }));
  const st = stateAt(m, m.rows.at(-1).day);
  const rows = sideSumRows(st.collateral);
  const dep = rows.lines.find((l) => l.key === "dep");
  assert.equal(dep.amount, "—");
  assert.deepEqual(dep.unpriced, ["WBTC"]);
  const rest = rows.lines.find((l) => l.kind === "rest");
  assert.equal(rest.amount, "—", "Market move has no figure either");
  const prov = flowSegmentProv(dep.seg, "collateral", "5 Jul '25", false);
  assert.match(prov.summary, /No figure: WBTC has no price at its block/);
  assert.ok(!prov.inputs.some((i) => i.label === "sum"), "no sum row");
  assert.deepEqual(
    prov.inputs.map((i) => [i.label, i.value]),
    [["asset with no price", "WBTC"]],
    "the asset named once",
  );
  // No bar for the line, and none for the balancing item beside it: a gap.
  const dep2 = st.collateral.sources.find((s) => s.key === "dep");
  assert.equal(dep2.width, 0);
  assert.equal(st.collateral.sources.find((s) => s.fill === "estimate").width, 0);
  assert.ok(st.collateral.bar.find((s) => s.key === "wd").width > 0, "a priced line keeps its bar");
});

test("Market move on one basis is the cent difference of the held figure and the lines", () => {
  const events = history();
  const m = model(events);
  const evs = focus(events);
  const cum = eventCum(m, evs, "e2");
  const heldCents = shownUsd(HELD, 97_000.5);
  const rows = eventSideSum(m, "collateral", cum, heldCents);
  const lines = rows.lines.filter((l) => l.kind !== "rest");
  const rest = rows.lines.find((l) => l.kind === "rest");
  const lineCents = Math.round(lines.reduce((a, l) => a + l.cents, 0) * 100) / 100;
  assert.equal(rest.cents, Math.round((heldCents - lineCents) * 100) / 100);
  assert.equal(rest.seg.market.held, heldCents);
  const mm = marketMoveProv("Market move", "collateral", "now", rest.seg.market);
  assert.equal(num(mm.inputs.at(-1).value), Math.abs(rest.cents));
  // The ledger: rows add to the total in cents; the event's row is its legs.
  const sum = eventTokenSum(m, evs, "collateral", cum, "e2");
  const l = tokenLedger({
    model: m,
    side: "collateral",
    ev: evs[2],
    sum,
    usd: { lines: rows.lines, dollars: rows.total.dollars, before: null, cents: rows.total.cents },
  });
  assert.deepEqual(ledgerAdds(l), { tokens: true, usd: true });
  const ev = l.rows.find((r) => r.role === "event");
  assert.equal(ev.usd.cents, -shownUsd(0.25, 95_000.5), "no rounding per leg");
  assert.equal(ev.usd.legs.length, 1);
  // Set to another price, the total is the tokens times it, as shown.
  const today = ledgerAtPrice(l, 99_000);
  assert.equal(today.usd.cents, shownUsd(sum.total.units / 10 ** sum.decimals, 99_000));
  assert.deepEqual(ledgerAdds(today), { tokens: true, usd: true });
});

test("Market move on two bases draws no figure and says so in one line", () => {
  const events = history({ basis: true });
  const m = model(events, { priceBasis: { collateral: "anchor" } });
  const evs = focus(events);
  const cum = eventCum(m, evs, "e2");
  const rows = eventSideSum(m, "collateral", cum, shownUsd(HELD, 97_000.5));
  const rest = rows.lines.find((l) => l.kind === "rest");
  assert.equal(rest.amount, "—");
  assert.equal(rest.none, "The two values stand on different bases (min then, anchor now).");
  const sum = eventTokenSum(m, evs, "collateral", cum, "e2");
  const l = tokenLedger({
    model: m,
    side: "collateral",
    ev: evs[2],
    sum,
    usd: { lines: rows.lines, dollars: rows.total.dollars, before: null, cents: rows.total.cents },
  });
  assert.deepEqual(l.notes, ["The two values stand on different bases (min then, anchor now)."]);
  assert.equal(l.rows.find((r) => r.role === "market").usd.text, "—");
});

test("a ledger in dollars splits the event's legs off the line in cents", () => {
  const events = history();
  const m = model(events);
  const evs = focus(events);
  const cum = eventCum(m, evs, "e1");
  const rows = eventSideSum(m, "collateral", cum, shownUsd(HELD, 97_000.5));
  const d = dollarLedger({
    model: m,
    side: "collateral",
    ev: evs[1],
    lines: rows.lines,
    dollars: rows.total.dollars,
    before: null,
    cents: rows.total.cents,
  });
  const ev = d.rows.find((r) => r.role === "event");
  const before = d.rows.find((r) => r.role === "before");
  assert.equal(ev.usd.cents, shownUsd(0.5, 90_000.123456));
  assert.equal(before.usd.cents, shownUsd(1.2345678, 98_765.43218765));
  assert.deepEqual(ledgerAdds(d), { tokens: true, usd: true });
});

test("raw legs keep the old rounding (the adapter)", () => {
  const raw = history().map((e) => ({
    ...e,
    legs: e.legs.map((l) => ({ bucket: l.bucket, usd: l.amount * 1000.004, symbol: "WBTC" })),
  }));
  const m = model(raw);
  const st = stateAt(m, m.rows.at(-1).day);
  const rows = sideSumRows(st.collateral);
  assert.equal(rows.total.cents, undefined);
  assert.ok(rows.lines.every((l) => l.cents == null));
});

test("a signed figure rounds half away from zero, so the face agrees with its receipt", () => {
  assert.equal(roundAway(-1150.5), -1151);
  assert.equal(roundAway(1150.5), 1151);
  assert.equal(centsOf(-0.125), -0.13);
  assert.equal(wholeUsd(-1150.5), "$1,151");
  assert.equal(wholeUsd(1150.5), "$1,151");
  // A withdrawal of $1,150.50 prints −$1,151, as its receipt's $1,150.50 does.
  const out = [
    {
      id: "a",
      ts: T0 + 10,
      block: 1,
      tick: "collateral",
      legs: [leg("dep", 3, 1000, 1)],
      balances: [],
      prices: [],
    },
    {
      id: "b",
      ts: T0 + DAY + 10,
      block: 2,
      tick: "collateral",
      legs: [leg("wd", 1.1505, 1000, 2)],
      balances: [],
      prices: [],
    },
  ];
  const m = model(out);
  const rows = sideSumRows(stateAt(m, m.rows.at(-1).day).collateral);
  const wd = rows.lines.find((l) => l.key === "wd");
  assert.equal(wd.cents, -1150.5);
  assert.equal(wd.dollars, -1151);
  assert.equal(wd.amount, "$1,151");
});

test("a negative leg under a cent sits behind the dust control too", () => {
  const { prov } = holderUsdReceipt({
    what: "x",
    legs: [
      { token: "A", amount: 5, amountNote: "n", price: 2, priceNote: "p" },
      { token: "B", amount: -0.001, amountNote: "n", price: 2, priceNote: "p" },
    ],
    via: "v",
    byValue: true,
  });
  assert.ok(prov.inputs.filter((i) => i.label.startsWith("B ")).every((i) => i.dust));
  assert.ok(prov.inputs.filter((i) => i.label.startsWith("A ")).every((i) => !i.dust));
});

test("a line of many legs builds its rows when the receipt opens, past twelve behind the dust control", () => {
  const legs = Array.from({ length: 15 }, (_, i) => leg("dep", 1 + i, 100, 100 + i));
  const prov = legsProv("Deposited", "now", legs);
  assert.ok(prov.key, "a key stands for the rows");
  assert.match(prov.summary, /To the cent, shown to the dollar\./);
  const shown = new Set(prov.inputs.filter((i) => !i.dust && i.label.endsWith(" amount")).map((i) => i.label));
  assert.equal(shown.size, 12);
  assert.ok(
    prov.inputs.some((i) => i.label === "WBTC at block 100 amount" && i.dust),
    "the smallest is past the cap",
  );
  assert.equal(
    num(prov.inputs.find((i) => i.label === "sum").value),
    legs.reduce((a, l) => a + l.usd, 0),
  );
});

test("several assets with no price read as plural", () => {
  assert.equal(noPriceWords(["WETH"]), "WETH has no price at its block");
  assert.equal(noPriceWords(["WETH", "USDC"]), "WETH and USDC have no price at their blocks");
});

test("a family's basis set with its legs' unset compares on one basis", () => {
  const events = history().map((e) => ({ ...e, legs: e.legs.map((l) => ({ ...l, basis: undefined })) }));
  const m = model(events, { priceBasis: { collateral: "anchor" } });
  const evs = focus(events);
  const cum = eventCum(m, evs, "e2");
  const rows = eventSideSum(m, "collateral", cum, shownUsd(HELD, 97_000.5));
  const rest = rows.lines.find((l) => l.kind === "rest");
  assert.equal(rest.none, undefined);
  assert.equal(typeof rest.cents, "number");
});

const { AAVE_V3_SERVED_NOTE } = await import(ROOT + "lib/aave-v3/price-notes.ts");
const { AAVE_V4_SERVED_NOTE } = await import(ROOT + "lib/aave-v4/price-notes.ts");

test("a served series' line names no legs, and its receipt says the server sums the day rows", () => {
  for (const served of [AAVE_V3_SERVED_NOTE, AAVE_V4_SERVED_NOTE]) {
    const m = buildFlowModel({
      buckets: BUCKETS,
      // Day rows as rails-server serves them: running totals, no legs.
      days: [
        { day: 20_000, events: 1, tick: "collateral", cum: { dep: 1234.56, wd: 0, bor: 0 }, balances: [], prices: [] },
      ],
      live: { collateralUsd: 1300, debtUsd: 0 },
      words: { served },
    });
    assert.equal(m.hasLegs, false);
    const dep = stateAt(m, 0).collateral.sources.find((s) => s.key === "dep");
    assert.equal(dep.legs, undefined, "no partial leg list");
    assert.ok(flowSegmentProv(dep, "collateral", "5 Jul '25", false).summary.endsWith(served));
  }
  assert.equal(AAVE_V3_SERVED_NOTE, "Each day's figure is summed by rails-server, whose day rows name no legs.");
});
