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

const { flowLeg, daysFromEvents, buildFlowModel, stateAt, livePriced, partialAt } = await import(
  ROOT + "lib/shared/flows-timeline.ts"
);
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
  assert.match(prov.summary, /No dollar figure: WBTC has no price at this block/);
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
  assert.equal(noPriceWords(["WETH"]), "WETH has no price at this block");
  assert.equal(noPriceWords(["WETH", "USDC"]), "WETH and USDC have no price at this block");
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
    const summary = flowSegmentProv(dep, "collateral", "5 Jul '25", false).summary;
    assert.ok(summary.endsWith(served));
    assert.doesNotMatch(summary, /oracle/, "no oracle claim for a served sum");
  }
  assert.match(AAVE_V3_SERVED_NOTE, /^Each day's figure is summed by rails-server from its stored prices/);
});

test("two lines with the same count, sum and last block get different receipt keys", () => {
  const a = legsProv("Deposited", "now", [leg("dep", 1, 30, 5), leg("dep", 2, 10, 9)]);
  const b = legsProv("Deposited", "now", [leg("dep", 2, 15, 5), leg("dep", 1, 20, 9)]);
  assert.equal(
    [leg("dep", 1, 30, 5), leg("dep", 2, 10, 9)].reduce((x, l) => x + l.usd, 0),
    [leg("dep", 2, 15, 5), leg("dep", 1, 20, 9)].reduce((x, l) => x + l.usd, 0),
  );
  assert.notEqual(a.key, b.key);
});

// ── A past day's held figure in rows (ui-jobs 743) ──────────────────────────
const { formatUsdValue } = await import(ROOT + "lib/utils/format.ts");
const { fmtUsdWhole } = await import(ROOT + "lib/liquity/figure-format.ts");

/** One WBTC deposit and one WETH deposit, then a quiet day priced by the store. */
function heldModel({ wethPrice = true } = {}) {
  const events = heldEvents();
  return buildFlowModel({
    buckets: BUCKETS,
    days: daysFromEvents(
      BUCKETS.map((b) => b.key),
      events,
    ),
    live: { collateralUsd: 0, debtUsd: 0 },
    today: 20_005,
    dailyPrices: {
      // The store's close of day 20,002 with its block; WETH's without one.
      wbtc: [[20_002, 99_000.123456, 1_500_000]],
      ...(wethPrice ? { weth: [[20_002, 3100.25]] } : {}),
    },
  });
}

function heldEvents() {
  return [
    {
      id: "a",
      ts: T0 + 10,
      block: 1001,
      tick: "collateral",
      legs: [leg("dep", 1.2345678, 98_765.43218765, 1001)],
      balances: [{ asset: "wbtc", symbol: "WBTC", side: "collateral", amount: 1.2345678 }],
      prices: [],
    },
    {
      id: "b",
      ts: T0 + 20,
      block: 1002,
      tick: "collateral",
      legs: [flowLeg({ bucket: "dep", amount: 2.5, symbol: "WETH", price: 3000.5, block: 1002, priceNote: "n" })],
      balances: [{ asset: "weth", symbol: "WETH", side: "collateral", amount: 2.5 }],
      prices: [],
    },
  ];
}

test("a past day's held figure is its rows to the cent, each naming the day's block", () => {
  const m = heldModel();
  const st = stateAt(m, 2);
  const held = st.collateral.bar[0];
  const want = Math.round((shownUsd(1.2345678, 99_000.123456) + shownUsd(2.5, 3100.25)) * 100) / 100;
  // The tip's figure is its rows' cents, shown to the dollar.
  assert.equal(sideSumRows(st.collateral).total.dollars, Math.round(want));
  const prov = flowSegmentProv(held, "collateral", "the end of 7 Oct '24", false, true);
  assert.equal(rebuild(prov).cents, want, "the rows multiply out to the figure");
  const notes = prov.inputs.filter((i) => i.label.endsWith(" price")).map((i) => i.note);
  assert.ok(notes.some((n) => /the daily store's price at the close of .+, block 1,500,000$/.test(n)));
  // A store row with no block says so.
  assert.ok(notes.some((n) => /a block the daily store's route does not name$/.test(n)));
});

/** The held model with live assets: WBTC and WETH at `prices` (null: no
 *  price), the read at `block`. */
function liveModel(prices, block) {
  const assets = [
    ["WBTC", 1.2345678, prices.wbtc],
    ["WETH", 2.5, prices.weth],
  ].map(([symbol, amount, p]) => ({
    side: "collateral",
    symbol,
    amount,
    usd: p == null ? 0 : amount * p,
    ...(p == null ? { unpriced: true } : { priced: livePriced(p, block, 20_005 * 86_400) }),
  }));
  return buildFlowModel({
    buckets: BUCKETS,
    days: daysFromEvents(
      BUCKETS.map((b) => b.key),
      heldEvents(),
    ),
    live: { collateralUsd: 1, debtUsd: 0, assets },
    today: 20_005,
    dailyPrices: { wbtc: [[20_002, 99_000.123456, 1_500_000]], weth: [[20_002, 3100.25]] },
  });
}

test("the live total is its rows' shown products, to the cent (ui-jobs 743, A8)", () => {
  const m = liveModel({ wbtc: 101_234.567891, weth: 3210.987654 }, 2_000_000);
  const want = centsOf(shownUsd(1.2345678, 101_234.567891) + shownUsd(2.5, 3210.987654));
  const st = stateAt(m, m.liveStop);
  assert.equal(st.collateral.now, want, "the live figure is the rows' cents, not the family's");
  assert.equal(sideSumRows(st.collateral).total.cents, want);
  const prov = flowSegmentProv(st.collateral.bar[0], "collateral", "now", true, true);
  assert.equal(rebuild(prov).cents, want, "the rows multiply out to the live total");
  assert.ok(
    prov.inputs.some((i) => /block 2,000,000$/.test(i.note ?? "")),
    "the price names its block",
  );
  assert.deepEqual(partialAt(m, m.liveStop, "collateral"), [], "a block named: complete");
});

test("a live read naming no block sits under Not complete (ui-jobs 743, A8)", () => {
  const m = liveModel({ wbtc: 101_234.567891, weth: 3210.987654 }, null);
  const st = stateAt(m, m.liveStop);
  const prov = flowSegmentProv(st.collateral.bar[0], "collateral", "now", true, true);
  assert.ok(prov.inputs.some((i) => /which names no block$/.test(i.note ?? "")));
  assert.deepEqual(partialAt(m, m.liveStop, "collateral"), [
    "WBTC and WETH at the latest read's price, which names no block.",
  ]);
});

test("a live asset with no price leaves the live total with none (ui-jobs 743, A8)", () => {
  const m = liveModel({ wbtc: 101_234.567891, weth: null }, 2_000_000);
  const st = stateAt(m, m.liveStop);
  const rows = sideSumRows(st.collateral);
  assert.equal(rows.total.amount, "—");
  assert.match(rows.total.none, /WETH has no price at this block/);
});

const { aaveV3FlowLive } = await import(ROOT + "lib/aave-v3/flows-timeline.ts");

/** An Aave tower whose current collateral lines carry `prices` (null: the
 *  tower could not price the line). */
function towerModel(prices, block) {
  const line = (symbol, amount, p) => ({
    key: symbol,
    symbol,
    amount,
    usd: p == null ? null : amount * p,
    ...(p == null ? {} : { price: { usd: p, block, source: "Aave's AaveOracle getAssetPrice now" } }),
    prov: { kind: "chain", summary: "s" },
  });
  const tower = {
    valued: true,
    collateral: {
      current: [line("WBTC", 1.2345678, prices.wbtc), line("WETH", 2.5, prices.weth)],
      interest: null,
      exited: [],
      liquidated: [],
      lifetimeInflow: 0,
    },
    debt: { current: [], interest: null, exited: [], liquidated: [], lifetimeInflow: 0 },
  };
  return buildFlowModel({
    buckets: BUCKETS,
    days: daysFromEvents(
      BUCKETS.map((b) => b.key),
      heldEvents(),
    ),
    live: aaveV3FlowLive(tower),
    today: 20_005,
    dailyPrices: { wbtc: [[20_002, 99_000.123456, 1_500_000]], weth: [[20_002, 3100.25]] },
  });
}

test("an Aave tower's live side is its lines' price rows (ui-jobs 743)", () => {
  const m = towerModel({ wbtc: 101_234.567891, weth: 3210.987654 }, 2_000_000);
  const want = centsOf(shownUsd(1.2345678, 101_234.567891) + shownUsd(2.5, 3210.987654));
  const st = stateAt(m, m.liveStop);
  assert.equal(st.collateral.now, want);
  const prov = flowSegmentProv(st.collateral.bar[0], "collateral", "now", true, true);
  assert.equal(rebuild(prov).cents, want);
  assert.ok(prov.inputs.some((i) => /AaveOracle getAssetPrice now, block 2,000,000$/.test(i.note ?? "")));
  assert.deepEqual(partialAt(m, m.liveStop, "collateral"), []);
  // A read naming no block: not complete.
  const blockless = towerModel({ wbtc: 101_234.567891, weth: 3210.987654 }, null);
  assert.equal(partialAt(blockless, blockless.liveStop, "collateral").length, 1);
});

test("an Aave tower line with no price leaves the live total with none (ui-jobs 743)", () => {
  const m = towerModel({ wbtc: 101_234.567891, weth: null }, 2_000_000);
  const rows = sideSumRows(stateAt(m, m.liveStop).collateral);
  assert.equal(rows.total.amount, "—");
  assert.match(rows.total.none, /WETH has no price at this block/);
});

test("a past day holding an asset with no price has no held figure and names the asset", () => {
  const m = buildFlowModel({
    buckets: BUCKETS,
    days: daysFromEvents(
      BUCKETS.map((b) => b.key),
      [
        {
          id: "a",
          ts: T0 + 10,
          block: 1001,
          tick: "collateral",
          legs: [leg("dep", 1, null, 1001)],
          balances: [{ asset: "wbtc", symbol: "WBTC", side: "collateral", amount: 1 }],
          prices: [],
        },
      ],
    ),
    live: { collateralUsd: 0, debtUsd: 0 },
    today: 20_005,
    dailyPrices: {},
  });
  const st = stateAt(m, 2);
  const rows = sideSumRows(st.collateral);
  assert.equal(rows.total.amount, "—");
  assert.match(rows.total.none, /WBTC has no price at this block/);
  assert.ok(!rows.lines.some((l) => l.kind === "rest"), "no remainder worked out from no figure");
});

test("an unpriced side renders no NaN in any shared formatter", () => {
  for (const s of [wholeUsd(Number.NaN), formatUsdValue(Number.NaN), fmtUsdWhole(Number.NaN)]) {
    assert.ok(!/NaN/.test(s), s);
    assert.equal(s, "—");
  }
});

// ── Every printed figure in cents; the line breaks where the bars do (ui-jobs 743) ──
const { flowLinePoints } = await import(ROOT + "lib/shared/flows-series.ts");
const { flowMoment } = await import(ROOT + "lib/shared/flow-moment.ts");
const { heldDayProv, flowAssetProv } = await import(ROOT + "lib/shared/flows-timeline-provenance.ts");

test("a past day's held figure, its assets and the state card are the rows' cents, each naming its block", () => {
  const m = heldModel();
  const wbtc = shownUsd(1.2345678, 99_000.123456);
  const weth = shownUsd(2.5, 3100.25);
  const want = centsOf(wbtc + weth);
  assert.equal(wbtc, 122_222.38, "1.234568 × $99,000.123456, to the cent");
  assert.equal(m.heldAt[2].find((h) => h.symbol === "WBTC").usd, wbtc);
  const st = stateAt(m, 2);
  assert.equal(st.collateral.now, want, "the bar's figure is the rows' cents");
  // An asset's part names its rows.
  const part = flowAssetProv("WBTC", st.collateral.bar[0], "collateral", "the end of 2 Oct '24", false, true);
  assert.equal(rebuild(part).cents, wbtc);
  assert.match(part.inputs.find((i) => i.label === "WBTC price").note, /block 1,500,000/);
  // The state card between events: each asset its shown product, the side their sum.
  const mo = flowMoment(m, [], (20_002 + 1) * DAY - 1);
  const a = mo.sides.collateral.assets.find((x) => x.symbol === "WBTC");
  assert.equal(a.usd, wbtc);
  assert.equal(a.price, 99_000.123456);
  const total = heldDayProv(
    "Collateral",
    "the close of 2 Oct '24",
    mo.sides.collateral.assets.map((x) => x.row),
  );
  assert.equal(rebuild(total).cents, want, "the card's total multiplies out");
  assert.equal(centsOf(mo.sides.collateral.assets.reduce((s, x) => s + x.usd, 0)), st.collateral.now);
});

test("a $1-face side is its grown debt at $1, to the cent", () => {
  const events = [
    {
      id: "a",
      ts: T0 + 10,
      block: 1001,
      tick: "debt",
      legs: [
        flowLeg({ bucket: "bor", amount: 1000, symbol: "BOLD", price: 1, block: 1001, priceNote: "face", face: true }),
      ],
      balances: [{ asset: "bold", symbol: "BOLD", side: "debt", amount: 1000 }],
      prices: [],
    },
  ];
  const m = buildFlowModel({
    buckets: BUCKETS,
    days: daysFromEvents(
      BUCKETS.map((b) => b.key),
      events,
    ),
    live: { collateralUsd: 0, debtUsd: 0 },
    today: 20_005,
    // The day's "price" is the interest built on the recorded debt.
    dailyPrices: { bold: [[20_002, 1.0001234567]] },
    words: { moment: { face: ["debt"] } },
  });
  const st = stateAt(m, 2);
  assert.equal(st.debt.now, 1000.12, "1,000 × 1.0001234567 at $1, to the cent");
  const prov = flowSegmentProv(st.debt.bar[0], "debt", "the end of 2 Oct '24", false, true);
  const price = prov.inputs.find((i) => i.label === "BOLD price");
  assert.equal(price.value, "$1.00");
  assert.equal(rebuild(prov).cents, 1000.12);
});

test("the line breaks on each day an asset held there has no price, as the bars do", () => {
  const m = heldModel();
  // No price stands for either asset before the store's day 20,002.
  const series = { points: [0, 1, 2, 3, 4].map((i) => [20_000 + i, 20_000 + i, 100 + i, 0]) };
  const pts = flowLinePoints(m, series).slice(0, 4);
  assert.deepEqual(
    pts.map((p) => p.collateral),
    [null, null, 102, 103],
  );
  for (const [i, p] of pts.entries()) {
    const bars = sideSumRows(stateAt(m, i).collateral).total.amount;
    assert.equal(p.collateral == null, bars === "—", `day ${i}: the line and the bar agree`);
  }
  assert.ok(
    pts.every((p) => p.debt === 0),
    "the debt side holds nothing unpriced",
  );
  // The live point breaks where a live asset has no price.
  const live = { ...m, liveHeld: [{ side: "collateral", symbol: "WBTC", amount: 1, usd: 0, unpriced: true }] };
  assert.equal(flowLinePoints(live, series).at(-1).collateral, null);
});

test("a live asset with no price breaks the line at the live point and draws no figure", async () => {
  const { shownNow, formatFlowUsd } = await import(ROOT + "lib/shared/flows-timeline.ts");
  const { aaveV4FlowLive } = await import(ROOT + "lib/aave-v4/flows-timeline.ts");
  const m = buildFlowModel({
    buckets: BUCKETS,
    days: daysFromEvents(
      BUCKETS.map((b) => b.key),
      [
        {
          id: "a",
          ts: T0 + 10,
          block: 1001,
          tick: "collateral",
          legs: [leg("dep", 1, null, 1001)],
          balances: [{ asset: "wbtc", symbol: "WBTC", side: "collateral", amount: 1 }],
          prices: [],
        },
      ],
    ),
    live: { collateralUsd: 0, debtUsd: 0 },
    today: 20_005,
    dailyPrices: {},
  });
  assert.deepEqual(
    m.liveHeld.map((h) => [h.symbol, h.unpriced]),
    [["WBTC", true]],
  );
  const series = { points: [[20_004, 20_004, 5, 0]] };
  assert.equal(flowLinePoints(m, series).at(-1).collateral, null, "the line breaks at the live point");
  const live = stateAt(m, m.liveStop);
  assert.equal(sideSumRows(live.collateral).total.amount, "—");
  assert.equal(formatFlowUsd(shownNow(live.collateral)), "—", "the headline draws no figure, never $0");
  // A family's live read with no price marks the asset (Aave V4).
  const v4 = aaveV4FlowLive(
    { inProtocolUsd: 0, outstandingUsd: 0 },
    [{ symbol: "WBTC", supplied: 1, withdrawn: 0, liquidatedCollateral: 0, borrowed: 0, repaid: 0, liquidatedDebt: 0 }],
    () => null,
  );
  assert.equal(v4.assets[0].unpriced, true);
});

test("a unit model's past-day rows carry no dollar price", () => {
  const m = buildFlowModel({
    buckets: BUCKETS,
    unit: { symbol: "USDC", scale: 6 },
    days: daysFromEvents(
      BUCKETS.map((b) => b.key),
      [
        {
          id: "a",
          ts: T0 + 10,
          block: 1001,
          tick: "collateral",
          legs: [{ bucket: "dep", usd: 5_000_000, symbol: "USDC" }],
          balances: [{ asset: "usdc", symbol: "USDC", side: "collateral", amount: 5 }],
          prices: [],
        },
      ],
    ),
    live: { collateralUsd: 5_000_000, debtUsd: 0 },
    today: 20_005,
    // A price in the token's grains: a million a token.
    dailyPrices: { usdc: [[20_002, 1_000_000, 1_500_000]] },
  });
  const st = stateAt(m, 2);
  assert.equal(m.heldAt[2][0].priced.price, undefined);
  for (const unit of [m.unit, undefined]) {
    const text = JSON.stringify(flowSegmentProv(st.collateral.bar[0], "collateral", "x", false, true, unit));
    assert.ok(!text.includes("$"), text);
  }
});

test("a $1-face receipt states the recorded debt, the factor and their product", () => {
  const events = [
    {
      id: "a",
      ts: T0 + 10,
      block: 1001,
      tick: "debt",
      legs: [
        flowLeg({
          bucket: "bor",
          amount: 1000.1234567,
          symbol: "BOLD",
          price: 1,
          block: 1001,
          priceNote: "face",
          face: true,
        }),
      ],
      balances: [{ asset: "bold", symbol: "BOLD", side: "debt", amount: 1000.1234567 }],
      prices: [],
    },
  ];
  const m = buildFlowModel({
    buckets: BUCKETS,
    days: daysFromEvents(
      BUCKETS.map((b) => b.key),
      events,
    ),
    live: { collateralUsd: 0, debtUsd: 0 },
    today: 20_005,
    dailyPrices: { bold: [[20_002, 1.0001234567891, 1_500_000]] },
    words: { moment: { face: ["debt"] } },
  });
  const st = stateAt(m, 2);
  const rows = flowSegmentProv(st.debt.bar[0], "debt", "the end of 2 Oct '24", false, true).inputs;
  const v = (l) => rows.find((r) => r.label === l)?.value;
  assert.equal(v("BOLD recorded debt"), "1,000.123457 BOLD");
  assert.equal(v("BOLD interest factor"), "1.000123457");
  // 1,000.123457 × 1.000123457 = 1,000.246929…, shown to six decimals.
  assert.equal(v("BOLD amount"), "1,000.246929 BOLD");
  assert.equal(v("BOLD price"), "$1.00");
  assert.equal(st.debt.now, 1000.25);
  const mo = flowMoment(m, [], (20_002 + 1) * DAY - 1);
  assert.equal(mo.sides.debt.assets[0].tokens, 1000.246929, "the card's tokens to six decimals");
});

test("a $1-face amount multiplies out from its printed rows, a 10^8 DAI vault among them", async () => {
  const { faceAmount, factorText, amountText } = await import(ROOT + "lib/shared/shown-usd.ts");
  // Exact decimal product of two printed strings, rounded half away to six places.
  const micro = (t) => {
    const [i, f = ""] = t.replace(/,/g, "").split(".");
    return BigInt(i + f.padEnd(6, "0").slice(0, 6));
  };
  const nano = (t) => {
    const [i, f = ""] = t.replace(/,/g, "").split(".");
    return BigInt(i + f.padEnd(9, "0"));
  };
  const rebuilt = (rText, fText) => {
    const p = micro(rText) * nano(fText);
    return Number((p + 500_000_000n) / 1_000_000_000n) / 1e6;
  };
  const cases = [
    [100_000_000.123456, 1.0000000123456],
    [123_456_789.987654, 1.04938271605],
    [99_999_999.999999, 1.000000000499],
    [1000.1234567, 1.0001234567891],
    [0.000001, 1.5],
  ];
  for (const [recorded, factor] of cases) {
    const rText = amountText(recorded);
    const fText = factorText(factor);
    assert.match(fText, /^\d\.\d{9}$/, "the factor to nine decimals");
    const amount = faceAmount(recorded, factor);
    assert.equal(rebuilt(rText, fText), amount, `${rText} × ${fText}`);
    assert.equal(amountText(amount), amountText(rebuilt(rText, fText)), "the printed amount");
  }
});
