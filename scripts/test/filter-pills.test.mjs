// components/shared/filter-bar/pill-model.ts: the listing toolbar's editable
// pills (rails-ops ui-jobs 681): each pill's state and words, removing a
// filter, the row's order and the sort pill's name. Run: npm test
//
// The model imports the range codec through `@/`, so this file registers a
// resolver for the alias (and the extensionless specifier) before loading it.
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

const {
  groupDimensions,
  pillFor,
  resetGroup,
  resetAll,
  activeGroupCount,
  orderPills,
  nextAppliedOrder,
  fixedOrder,
  sortSpoken,
  thresholdMode,
} = await import("../../components/shared/filter-bar/pill-model.ts");

// A registry shaped like Aave V3's: Status resting on Open, a single Market, a
// boolean History, a multi asset list, a USD Size pair and a count range.
const STATUS = ["open", "closed", "liquidated"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
const dims = [
  {
    id: "status",
    label: "Status",
    group: "Status",
    cardinality: "multi",
    options: STATUS,
    get: (f) => (f.status.length ? f.status : ["open"]),
    defaultValues: () => ["open"],
    defaultChip: (f) => (f.status.length ? null : "Status: Open"),
    set: (f, v) => ({ ...f, status: v.length === 1 && v[0] === "open" ? [] : v }),
  },
  {
    id: "market",
    label: "Market",
    group: "Market",
    cardinality: "single",
    options: [
      { value: "core", label: "Core" },
      { value: "prime", label: "Prime" },
    ],
    get: (f) => f.market,
    set: (f, v) => ({ ...f, market: v }),
  },
  {
    id: "debt",
    label: "Debt",
    group: "Size",
    cardinality: "range",
    range: { min: 0, max: 1e6, usd: true },
    options: [],
    get: (f) => f.debt,
    set: (f, v) => ({ ...f, debt: v }),
  },
  {
    id: "coll",
    label: "Collateral",
    group: "Size",
    cardinality: "range",
    range: { min: 0, max: 1e6, usd: true },
    options: [],
    get: (f) => f.coll,
    set: (f, v) => ({ ...f, coll: v }),
  },
  {
    id: "liq",
    label: "History",
    group: "History",
    cardinality: "single",
    options: [{ value: "liquidated", label: "Liquidated before" }],
    get: (f) => f.liq,
    set: (f, v) => ({ ...f, liq: v }),
    chipLabel: () => "Liquidated before",
  },
  {
    id: "supplying",
    label: "Supplying",
    group: "Assets",
    cardinality: "multi",
    options: ["USDC", "WETH", "WBTC", "DAI"].map((s) => ({ value: s, label: s })),
    get: (f) => f.supplying,
    set: (f, v) => ({ ...f, supplying: v }),
  },
  {
    id: "tx",
    label: "Transactions",
    group: "Transactions",
    cardinality: "range",
    range: { min: 1, max: 100000 },
    options: [],
    get: (f) => f.tx,
    set: (f, v) => ({ ...f, tx: v }),
  },
];
const base = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  market: [],
  debt: [],
  coll: [],
  liq: [],
  supplying: [],
  tx: [],
};
const pill = (f, name) =>
  pillFor(
    groupDimensions(dims, f).find((g) => g.name === name),
    f,
  );

test("an unset group has no value and names its filter", () => {
  const p = pill(base, "Market");
  assert.equal(p.state, "unset");
  assert.equal(p.locked, false);
  assert.equal(p.spoken, "Add Market filter");
});

test("a set pill carries a muted label and a bold value", () => {
  assert.deepEqual(
    (({ state, label, value }) => ({ state, label, value }))(pill({ ...base, market: ["prime"] }, "Market")),
    { state: "set", label: "Market", value: "Prime" },
  );
  assert.equal(pill({ ...base, tx: ["100-"] }, "Transactions").value, "≥ 100");
  assert.equal(pill({ ...base, tx: ["-50"] }, "Transactions").value, "≤ 50");
  assert.equal(pill({ ...base, tx: ["10-500"] }, "Transactions").spoken, "Transactions 10–500");
  assert.equal(pill({ ...base, supplying: ["USDC", "WETH", "DAI"] }, "Assets").value, "USDC +2");
});

test("a boolean shows its name only", () => {
  const p = pill({ ...base, liq: ["liquidated"] }, "History");
  assert.equal(p.label, "");
  assert.equal(p.value, "Liquidated before");
  assert.equal(p.spoken, "Liquidated before");
});

test("a group of several ranges names the one that is set", () => {
  assert.equal(pill({ ...base, debt: ["1000000-10000000"] }, "Size").value, "Debt $1M–$10M");
  // The shared Size ranges label their panel "Debt (USD)"; the pill takes the chip's word.
  const debtUsd = {
    ...dims.find((d) => d.id === "debt"),
    label: "Debt (USD)",
    chipLabel: (v) => `Debt: ${v[0] === "-0" ? "$0" : v[0]}`,
  };
  const size = pillFor({ name: "Size", dims: [debtUsd, dims.find((d) => d.id === "coll")] }, { ...base, debt: ["-0"] });
  assert.equal(size.spoken, "Size Debt $0");
});

test("a default that narrows the list is a locked set pill", () => {
  const p = pill(base, "Status");
  assert.equal(p.state, "default");
  assert.equal(p.locked, true);
  assert.equal(p.value, "Open");
  // Changed, it stays locked: its editor resets to the default, never removes.
  const changed = pill({ ...base, status: ["open", "closed"] }, "Status");
  assert.equal(changed.state, "set");
  assert.equal(changed.locked, true);
});

test("a default that narrows nothing is an unset pill", () => {
  // The vault roster's Shown preset: "100+ holders" by default, "Every vault"
  // where a link lifts it; its chip names only the first.
  const shown = (arrival) => ({
    id: "show",
    label: "Shown",
    group: "Shown",
    cardinality: "single",
    options: [
      { value: "used", label: "100+ holders" },
      { value: "all", label: "Every vault" },
    ],
    get: (s) => s.show,
    set: (s, v) => ({ ...s, show: v.length ? v : [arrival] }),
    defaultValues: () => [arrival],
    defaultChip: (s) => (s.show[0] === "used" ? "100+ holders" : null),
  });
  const preset = pillFor({ name: "Shown", dims: [shown("used")] }, { show: ["used"] });
  assert.deepEqual([preset.state, preset.locked, preset.value], ["default", true, "100+ holders"]);
  // Widened by hand from the preset, it stays locked: its way back is Reset to default.
  const widened = pillFor({ name: "Shown", dims: [shown("used")] }, { show: ["all"] });
  assert.deepEqual([widened.state, widened.locked, widened.value], ["set", true, "Every vault"]);
  const lifted = pillFor({ name: "Shown", dims: [shown("all")] }, { show: ["all"] });
  assert.deepEqual([lifted.state, lifted.locked, lifted.spoken], ["unset", false, "Add Shown filter"]);
});

test("a single choice resting on its every option draws no pill (ui-jobs 805)", () => {
  // Status as Open / Closed / All: Open at rest, All once the search names a holder.
  const choice = (rest) => ({
    id: "status",
    label: "Status",
    group: "Status",
    cardinality: "single",
    segmented: true,
    options: [
      { value: "open", label: "Open" },
      { value: "closed", label: "Closed" },
      { value: "all", label: "All", every: true },
    ],
    get: (f) => [f.status[0] ?? rest],
    set: (f, v) => ({ ...f, status: v[0] === rest ? [] : v }),
    defaultValues: () => [rest],
  });
  const at = (rest, status) => pillFor({ name: "Status", dims: [choice(rest)] }, { status });
  const open = at("open", []);
  assert.deepEqual([open.state, open.locked, open.value], ["default", true, "Open"]);
  const all = at("all", []);
  assert.deepEqual([all.state, all.locked, all.spoken], ["unset", false, "Add Status filter"]);
  const picked = at("all", ["closed"]);
  assert.deepEqual([picked.state, picked.locked, picked.value], ["set", false, "Closed"]);
  assert.deepEqual(resetGroup({ name: "Status", dims: [choice("all")] }, { status: ["open"] }).status, []);
  // An option worth "all" that is not marked every stays a constraint at rest.
  const unmarked = { ...choice("all"), options: choice("all").options.map(({ every, ...o }) => o) };
  assert.equal(pillFor({ name: "Status", dims: [unmarked] }, { status: [] }).locked, true);
});

test("removing a filter puts its group back to the default", () => {
  const f = { ...base, debt: ["100-"], coll: ["-5000"], market: ["core"] };
  const size = groupDimensions(dims, f).find((g) => g.name === "Size");
  const next = resetGroup(size, f);
  assert.deepEqual([next.debt, next.coll, next.market], [[], [], ["core"]]);
  const status = groupDimensions(dims, f).find((g) => g.name === "Status");
  assert.deepEqual(resetGroup(status, { ...f, status: ["closed"] }).status, []);
});

test("the count of set groups and Clear all leave the default and the sort alone", () => {
  const f = { ...base, sortBy: "debt", market: ["core"], tx: ["10-"], debt: ["1-"], coll: ["1-"] };
  const groups = groupDimensions(dims, f);
  assert.equal(activeGroupCount(groups, f), 3);
  const cleared = resetAll(groups, f);
  assert.equal(activeGroupCount(groups, cleared), 0);
  assert.equal(cleared.sortBy, "debt");
  assert.equal(pillFor(groups[0], cleared).state, "default");
});

test("set pills lead in the order applied, unset ones follow in the fixed order", () => {
  const f = { ...base, tx: ["100-"], liq: ["liquidated"] };
  const pills = groupDimensions(dims, f).map((g) => pillFor(g, f));
  // Status was set on arrival; Transactions then History were applied.
  const applied = nextAppliedOrder(nextAppliedOrder(["Status"], ["Status", "Transactions"]), [
    "Status",
    "Transactions",
    "History",
  ]);
  assert.deepEqual(applied, ["Status", "Transactions", "History"]);
  assert.deepEqual(
    orderPills(pills, applied).map((p) => p.name),
    ["Status", "Transactions", "History", "Market", "Size", "Assets"],
  );
  // A group no longer set leaves the applied order.
  assert.deepEqual(nextAppliedOrder(applied, ["Status", "History"]), ["Status", "History"]);
});

test("a family's own groups keep their places among the fixed ones", () => {
  assert.deepEqual(fixedOrder(["Transactions", "Hub", "Status", "Vault"]), ["Status", "Hub", "Transactions", "Vault"]);
});

test("the sort pill says its key and its direction", () => {
  assert.equal(sortSpoken("Recent activity", "desc"), "Sort: Recent activity, descending");
  assert.equal(sortSpoken("Debt", "asc"), "Sort: Debt, ascending");
});

test("a count range opens in the mode its bounds say", () => {
  assert.equal(thresholdMode(100, null), "min");
  assert.equal(thresholdMode(null, 50), "max");
  assert.equal(thresholdMode(10, 500), "between");
  assert.equal(thresholdMode(null, null), "min");
});

// ── The Properties pill (ui-jobs 735) ───────────────────────────────────────
// A listing's two-option properties share one pill where there are two or
// more; a lone one keeps its own. Each keeps its own field (its URL param).
const propDim = (id, label, options) => ({
  id,
  label,
  group: label,
  cardinality: "single",
  property: true,
  options: options.map(([value, l]) => ({ value, label: l })),
  get: (f) => (f[id] ? [f[id]] : []),
  set: (f, v) => ({ ...f, [id]: v[0] }),
});
const redeemed = propDim("redemptions", "Redemptions", [
  ["with", "Redeemed"],
  ["without", "Never redeemed"],
]);
const delegated = propDim("delegation", "Delegation", [
  ["delegated", "Delegated"],
  ["individual", "Individual"],
]);
const plain = {
  id: "market",
  label: "Market",
  cardinality: "multi",
  options: [{ value: "a", label: "A" }],
  get: (f) => f.market ?? [],
  set: (f, v) => ({ ...f, market: v }),
};

test("two properties share one Properties pill where the first stood", () => {
  const groups = groupDimensions([plain, redeemed, delegated], {});
  assert.deepEqual(
    groups.map((g) => g.name),
    ["Market", "Properties"],
  );
  assert.deepEqual(
    groups[1].dims.map((d) => d.id),
    ["redemptions", "delegation"],
  );
  const unset = pillFor(groups[1], {});
  assert.equal(unset.state, "unset");
  assert.equal(unset.spoken, "Add Properties filter");
});

test("a lone property keeps its own pill", () => {
  assert.deepEqual(
    groupDimensions([plain, redeemed], {}).map((g) => g.name),
    ["Market", "Redemptions"],
  );
});

test("a set Properties pill reads its choices", () => {
  const [, props] = groupDimensions([plain, redeemed, delegated], {});
  const one = pillFor(props, { redemptions: "with" });
  assert.equal(one.label, "");
  assert.equal(one.value, "Redeemed");
  const both = pillFor(props, { redemptions: "with", delegation: "delegated" });
  assert.equal(both.value, "Redeemed · Delegated");
  const third = propDim("x", "X", [
    ["1", "One"],
    ["2", "Two"],
  ]);
  const [, three] = groupDimensions([plain, redeemed, delegated, third], {});
  assert.equal(pillFor(three, { redemptions: "with", delegation: "delegated", x: "1" }).value, "Redeemed +2");
  // Removing it clears each property's own field.
  assert.deepEqual(resetGroup(props, { redemptions: "with", delegation: "delegated" }), {
    redemptions: undefined,
    delegation: undefined,
  });
});
