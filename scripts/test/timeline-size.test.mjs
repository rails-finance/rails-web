// lib/shared/timeline-size.ts and lib/liquity-v2/timeline-size.ts: the
// timeline's Size filter (rails-ops ui-jobs 752) and the cut-page notice
// (752, 753). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const root = new URL("../../", import.meta.url).href;
const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = ${JSON.stringify(root)};
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    for (const ext of [".ts", ".tsx"]) {
      const url = root + specifier.slice(2) + ext;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const size = await import("../../lib/shared/timeline-size.ts");
const lv2 = await import("../../lib/liquity-v2/timeline-size.ts");
const { eventPassesAxes } = await import("../../hooks/useTimelineEvents.ts");
const { folderAdmits, folderMatchCount } = await import("../../lib/shared/timeline-folder-filter.ts");
const { timelineFilterModel, draftAxesView, clearTimelineFilters } = await import(
  "../../components/shared/timeline-filter-model.ts"
);
const { groupDimensions, pillFor } = await import("../../components/shared/filter-bar/pill-model.ts");

/** A Liquity V2 Trove event moving `debt` BOLD and `coll` of the branch. */
const trove = (id, operation, debt, coll) => ({
  id,
  txHash: `0x${id}`,
  blockNumber: 1,
  timestamp: 1,
  wallet: "0x",
  actionType: operation,
  actionLabel: operation,
  flows: [],
  etherscanUrl: "",
  context: {
    protocol: "liquity-v2-troves",
    data: {
      collateralType: "rETH",
      operation,
      troveOperation: debt == null ? undefined : { debtChangeFromOperation: debt, collChangeFromOperation: coll },
    },
  },
});

const dims = lv2.liquityV2TroveSizeDims("rETH");
const pass = (e, ranges) => size.sizePasses(e, dims, ranges);

test("the Trove's ranges are Debt in BOLD and Collateral in the branch's unit", () => {
  assert.deepEqual(
    dims.map((d) => [d.side, d.word, d.unit]),
    [
      ["debt", "Debt", "BOLD"],
      ["coll", "Collateral", "rETH"],
    ],
  );
  assert.equal(lv2.liquityV2TroveSizeDims("WETH")[1].unit, "ETH");
});

test("a redemption's debt counts, unsigned, though no BOLD flow carries it", () => {
  const redeem = trove("r", "redeemCollateral", -2363.6, -0.4581);
  assert.equal(dims[0].figure(redeem), 2363.6);
  assert.ok(pass(redeem, { debt: ["1000-"] }));
  assert.ok(!pass(redeem, { debt: ["10000-"] }));
});

test("an event that moved nothing is 0: out of a minimum, inside a maximum", () => {
  const rate = trove("b", "setBatchManagerAnnualInterestRate", null);
  assert.equal(dims[0].figure(rate), 0);
  assert.ok(!pass(rate, { debt: ["1-"] }));
  assert.ok(pass(rate, { debt: ["-0"] }));
});

test("both sides bounded keep only the events inside both", () => {
  const open = trove("o", "openTrove", 2_000_000, 2500);
  const repay = trove("p", "adjustTrove", -249_227.27, 0);
  const ranges = { debt: ["100000-"], coll: ["1000-"] };
  assert.ok(pass(open, ranges));
  assert.ok(!pass(repay, ranges));
});

test("an event with no figure falls out of any bound", () => {
  const claim = { ...trove("c", "claim"), context: { protocol: "liquity-coll-surplus-claim", data: {} } };
  assert.equal(dims[0].figure(claim), null);
  assert.ok(!pass(claim, { debt: ["-1000000"] }));
  assert.ok(pass(claim, {}));
});

test("the surplus claim's collateral comes off its flow, WETH as ETH", () => {
  const weth = lv2.liquityV2TroveSizeDims("WETH");
  const claim = {
    ...trove("c", "claim"),
    context: { protocol: "liquity-coll-surplus-claim", data: {} },
    flows: [{ tokenSymbol: "WETH", amountFormatted: 1.5, direction: "in" }],
  };
  assert.equal(weth[1].figure(claim), 1.5);
});

test("a Stability Pool touch's Deposited is its top-up or withdrawal in BOLD", () => {
  const rows = { a: "12500000000000000000000", w: "-3000000000000000000", t: "0" };
  const [dep] = lv2.liquityV2SpSizeDims((e) => rows[e.id]);
  assert.deepEqual([dep.side, dep.word, dep.unit], ["deposit", "Deposited", "BOLD"]);
  assert.equal(dep.figure({ id: "a" }), 12500);
  assert.equal(dep.figure({ id: "w" }), 3);
  assert.equal(dep.figure({ id: "t" }), 0);
  assert.equal(dep.figure({ id: "missing" }), null);
});

test("Size reads and writes the listings' params", () => {
  const sp = new URLSearchParams("debt=10000-&coll=-50&hide=x");
  assert.deepEqual(size.readSizeParams(sp, ["debt", "coll"]), { debt: ["10000-"], coll: ["-50"] });
  assert.deepEqual(size.readSizeParams(sp, ["coll"]), { coll: ["-50"] });
  // The old dropdown's value keeps its meaning on Debt.
  assert.deepEqual(size.readSizeParams(new URLSearchParams("debt=borrowing"), ["debt"]), { debt: ["1-"] });
  const out = new URLSearchParams("coll=5-&debt=1-");
  size.writeSizeParams(out, ["debt"], { debt: ["10000-"] });
  assert.equal(out.toString(), "coll=5-&debt=10000-");
  size.writeSizeParams(out, ["debt", "coll"], {});
  assert.equal(out.toString(), "");
});

const axes = (ranges) => ({
  hiddenActions: new Set(),
  hiddenAssets: new Set(),
  hiddenCounterparties: new Set(),
  hiddenVersions: new Set(),
  size: { dims, ranges },
});

test("Size is one more axis in the predicate grouped members answer", () => {
  // A run of redemptions grouped client-side: each member answers alone.
  const members = [trove("1", "redeemCollateral", -50, -0.01), trove("2", "redeemCollateral", -20_000, -4)];
  const kept = members.filter((e) => eventPassesAxes(e, axes({ debt: ["10000-"] })));
  assert.deepEqual(
    kept.map((e) => e.id),
    ["2"],
  );
  // Type and Size together: both must admit.
  const hideRedeem = { ...axes({ debt: ["10000-"] }), hiddenActions: new Set(["redeemCollateral"]) };
  assert.equal(members.filter((e) => eventPassesAxes(e, hideRedeem)).length, 0);
});

test("a served folder stands under Size and its members are read", () => {
  const folder = {
    count: 40,
    other: 0,
    counts: [{ key: "supply", count: 40 }],
    legs: [],
    byDay: [],
    firstAt: 0,
    lastAt: 1,
  };
  const base = { hiddenActions: new Set(), hiddenAssets: new Set(), hiddenCounterparties: new Set(), dateRange: null };
  assert.equal(folderMatchCount(folder, base), 40);
  assert.ok(folderAdmits(folder, { ...base, sizeActive: true }));
  assert.equal(folderMatchCount(folder, { ...base, sizeActive: true }), null);
});

/** The filter model over a stand-in state with the Trove's Size. */
function modelState(sizeRanges = {}) {
  const log = [];
  const tl = {
    hiddenKeys: { action: [], asset: [], counterparty: [], version: [] },
    eventOptions: [
      { key: "openTrove", label: "Open" },
      { key: "redeemCollateral", label: "Redemption" },
    ],
    visibleActionKeys: new Set(["openTrove", "redeemCollateral"]),
    toggleHiddenAction: () => {},
    resetHiddenActions: () => {},
    assetOptions: [],
    visibleAssetKeys: new Set(),
    versionOptions: [],
    visibleVersionKeys: new Set(),
    counterpartyOptions: [],
    visibleCounterpartyKeys: new Set(),
    sizeDims: dims,
    sizeRanges,
    setSizeRange: (side, values) => log.push([side, values]),
  };
  return { tl, log };
}

test("Size is one pill after Type, its chips the listings' format", () => {
  const { tl } = modelState({ debt: ["10000-"] });
  const m = timelineFilterModel(tl);
  assert.deepEqual(
    m.dimensions.map((d) => d.id),
    ["type", "debt", "coll"],
  );
  const groups = groupDimensions(m.dimensions, m.filters);
  const sizePill = pillFor(groups[1], m.filters);
  assert.equal(sizePill.name, "Size");
  assert.equal(m.dimensions[1].label, "Debt (BOLD)");
  assert.equal(m.dimensions[2].label, "Collateral (rETH)");
  assert.equal(m.dimensions[1].chipLabel(["10000-"], []), "Debt: ≥ 10K BOLD");
  assert.equal(m.dimensions[2].chipLabel(["-50"], []), "Collateral: ≤ 50 rETH");
  assert.equal(m.dimensions[2].panelNote, "The amount each event moved, in BOLD and rETH.");
});

test("a Size write reaches the hook side by side, and Clear all clears it", () => {
  const { tl, log } = modelState({ debt: ["10000-"] });
  const m = timelineFilterModel(tl);
  m.onChange({ ...m.filters, coll: ["1-"] });
  assert.deepEqual(log, [["coll", ["1-"]]]);
  log.length = 0;
  clearTimelineFilters(m);
  assert.deepEqual(log, [["debt", []]]);
});

test("a draft carries its Size ranges", () => {
  const { tl } = modelState();
  const view = draftAxesView(tl, { ...timelineFilterModel(tl).filters, debt: ["5-"] });
  assert.deepEqual(view.size.ranges, { debt: ["5-"], coll: [], deposit: [] });
});

test("the notice applies under a Size or Type filter on a page short of the history", () => {
  const spark = {
    narrowed: true,
    totalCount: 28_179,
    servedEventCount: 1_000,
    totalKnown: true,
    totalIsFloor: false,
    windowUnread: false,
  };
  const n = size.searchedNotice(spark);
  assert.deepEqual(n, { searched: 1_000, older: 27_179, atLeast: false });
  assert.equal(size.searchedNoticeText(n), "Searched the latest 1,000 events. 27,179 older ones not searched.");
  // No Size or Type filter, the whole history held, or the total unknown: none.
  assert.equal(size.searchedNotice({ ...spark, narrowed: false }), null);
  assert.equal(size.searchedNotice({ ...spark, servedEventCount: 28_179 }), null);
  assert.equal(size.searchedNotice({ ...spark, totalKnown: false }), null);
  // A window whose opening read is pending or failed: the older count is unknown.
  const unread = size.searchedNotice({ ...spark, totalKnown: false, windowUnread: true });
  assert.deepEqual(unread, { searched: 1_000, older: null, atLeast: false });
  assert.equal(size.searchedNoticeText(unread), "Searched the latest 1,000 events. Older ones not searched.");
  assert.equal(size.searchedNotice({ ...spark, narrowed: false, windowUnread: true }), null);
  const floor = size.searchedNotice({ ...spark, totalCount: 1_001, totalIsFloor: true });
  assert.equal(size.searchedNoticeText(floor), "Searched the latest 1,000 events. At least 1 older one not searched.");
});

test("a Stability Pool deposit's range writes ?deposit=, its own param", () => {
  const spDims = lv2.liquityV2SpSizeDims(() => "1000000000000000000");
  const log = [];
  const { tl } = modelState();
  const m = timelineFilterModel({ ...tl, sizeDims: spDims, setSizeRange: (s, v) => log.push([s, v]) });
  const dep = m.dimensions.find((d) => d.id === "deposit");
  assert.equal(dep.param, "deposit");
  assert.equal(dep.label, "Deposited (BOLD)");
  assert.equal(dep.chipLabel(["10000-"], []), "Deposited: ≥ 10K BOLD");
  m.onChange(dep.set(m.filters, ["5-"]));
  assert.deepEqual(log, [["deposit", ["5-"]]]);
  assert.deepEqual(size.readSizeParams(new URLSearchParams("coll=1-&deposit=5-"), ["deposit"]), { deposit: ["5-"] });
});
