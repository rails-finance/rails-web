// The protocol map's used routes (ui-jobs 882): which boxes the address used
// (`usedNodes`), the compact grid that draws only them (`mapCompactGrid`), and
// the `?routes=all` param. Fixtures: the two Polaris answers of
// polaris-peth-map-fill.test.mjs, with each row's place added by hand.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
    const url = new URL(specifier + ".ts", context.parentURL).href;
    if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { buildPethMapFill } = await import("../../lib/polaris/peth-map-fill.ts");
const { POLARIS_MAP_LAYOUT, PM } = await import("../../lib/polaris/peth-map-layout.ts");
const {
  MAP_HOLDER,
  MAP_ROUTES_PARAM,
  mapCompactGrid,
  mapFullGrid,
  mapJoined,
  mapNothingUnused,
  mapRoutesFromParam,
  mapRoutesHref,
  usedNodes,
} = await import("../../lib/shared/protocol-map/types.ts");

const fx = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/polaris-peth/${name}.json`, import.meta.url), "utf8"));

const T = (symbol, address) => ({ symbol, address });
const R = (summary) => () => ({ kind: "chain-derived", summary });
const CTX = {
  chain: "sepolia",
  peth: T("pETH", "0x07ea2ff889e6228cded329a09f66e370f12c705e"),
  fpeth: T("fpETH", "0x94220c1c340336527c719bcf06067ca7769ac185"),
  vpeth: T("vpETH", "0x43cc4978e11bc1e1d8cfcd8348cb7e7246c49b6e"),
  svpeth: T("svpETH", "0x7b118bd63bbe9023a2a509cecd48bc283d150539"),
  weth: T("WETH", "0xf430240a61e0a5bd7a3637d616e0dab5632fbe89"),
  others: {
    "0x899d225d779f41fa1ab422ab1b8a9408296dd5c6": T("USDp", "0x899d225d779f41fa1ab422ab1b8a9408296dd5c6"),
    "0x1068ed496d21bf5357b2f1e9d25f46934f43ca99": T("GOLDp", "0x1068ed496d21bf5357b2f1e9d25f46934f43ca99"),
    "0x5543ca71ed8c88daf217488b1808994e080d925b": T("POLAR", "0x5543ca71ed8c88daf217488b1808994e080d925b"),
  },
  marketSymbol: { usdp: "USDp", goldp: "GOLDp" },
  venueLabel: {
    venue_curve_tripool: "Curve pETH/fpETH/vpETH pool",
    venue_univ2_polar_peth: "Uniswap V2 pETH/POLAR pair",
  },
  timelineHref: (id) => `/sepolia/polaris/peth/x?map=${encodeURIComponent(id)}`,
  receipts: {
    held: R("held"),
    cdpTotal: R("cdpTotal"),
    cdp: R("cdp"),
    spTotal: R("spTotal"),
    sp: R("sp"),
    loanTotal: R("loanTotal"),
    loan: R("loan"),
    lpTotal: R("lpTotal"),
    lp: R("lp"),
  },
};

const grid = (name) => {
  const f = buildPethMapFill(fx(name), CTX);
  const used = usedNodes(POLARIS_MAP_LAYOUT, f);
  return { f, used, g: mapCompactGrid(POLARIS_MAP_LAYOUT, used, mapJoined(POLARIS_MAP_LAYOUT, f)) };
};

/** Each row of a grid as its nodes' ids, left to right. */
const rowsOf = (g) =>
  Array.from({ length: g.rows }, (_, i) =>
    Object.entries(g.cells)
      .filter(([, c]) => c.row === i + 1)
      .sort((a, b) => a[1].col - b[1].col)
      .map(([id]) => id),
  );

/** A grid's cells are inside it and no two overlap. */
const assertSound = (g) => {
  for (const r of rowsOf(g)) {
    let end = 1;
    for (const id of r) {
      const c = g.cells[id];
      assert.ok(c.col >= end, `${id} overlaps`);
      end = c.col + c.span;
      assert.ok(end - 1 <= g.columns, `${id} past the grid`);
    }
  }
};

/** The centre of a cell, in grid columns. */
const centre = (c) => c.col - 1 + c.span / 2;

test("the used set: the holder, each box a filled arrow touches, each box with a now line or a count", () => {
  const { f, used } = grid("map-38d7");
  assert.deepEqual([...used].sort(), [MAP_HOLDER, PM.eth, PM.fee, PM.zap, PM.curve, PM.cdp, PM.loan].sort());
  // A box with a "now" line of its own is used, with no arrow to it.
  const lone = { ...f, edges: {}, rows: [], nodes: { [PM.morpho]: { lines: [{ label: "now", amounts: [] }] } } };
  assert.deepEqual([...usedNodes(POLARIS_MAP_LAYOUT, lone)].sort(), [MAP_HOLDER, PM.morpho].sort());
  // An "in" line or a note alone does not make a box used; a row count does.
  const noted = {
    ...lone,
    nodes: {
      [PM.morpho]: {
        lines: [
          { label: "in", amounts: [] },
          { label: "note", amounts: [], text: "x" },
        ],
      },
      [PM.splitter]: { lines: [], rowCount: 3 },
      [PM.sp]: { lines: [], rowCount: 0 },
    },
  };
  assert.deepEqual([...usedNodes(POLARIS_MAP_LAYOUT, noted)].sort(), [MAP_HOLDER, PM.splitter].sort());
});

test("compact grid, CDPs and a loan: unused columns dropped, columns kept aligned, the holder centred", () => {
  const { g } = grid("map-38d7");
  assert.deepEqual(rowsOf(g), [[PM.eth, PM.fee], [PM.zap, PM.curve], [MAP_HOLDER], [PM.cdp, PM.loan]]);
  // Layout columns 2 and 7 hold no used box: five columns are left.
  assert.equal(g.columns, 5);
  assert.equal(g.scale, 5 / 7);
  // ETH and WETH stays over the zap router, the fee router over the curve.
  assert.equal(g.cells[PM.eth].col, g.cells[PM.zap].col);
  assert.equal(g.cells[PM.fee].col, g.cells[PM.curve].col);
  assert.deepEqual(g.cells[MAP_HOLDER], { col: 2, span: 3, row: 3 });
  assert.deepEqual(g.cells[PM.cdp], { col: 1, span: 1, row: 4 });
  assert.deepEqual(g.cells[PM.loan], { col: 2, span: 1, row: 4 });
  assert.equal(centre(g.cells[MAP_HOLDER]), g.columns / 2);
  assertSound(g);
});

test("compact grid, zaps, pools and svpETH: every column used, so every box keeps its layout cell", () => {
  const { g } = grid("map-c513");
  assert.deepEqual(rowsOf(g), [
    [PM.eth, PM.fee],
    [PM.other, PM.zap, PM.curve, PM.outside],
    [MAP_HOLDER],
    [PM.pools, PM.svpeth],
  ]);
  assert.equal(g.columns, 7);
  const byId = new Map(POLARIS_MAP_LAYOUT.nodes.map((n) => [n.id, n]));
  for (const [id, c] of Object.entries(g.cells)) {
    const n = byId.get(id);
    assert.deepEqual({ col: c.col, span: c.span }, { col: n.col, span: n.span }, id);
  }
  assert.equal(g.cells[PM.eth].col, g.cells[PM.zap].col);
  assert.equal(g.cells[PM.fee].col, g.cells[PM.curve].col);
  assertSound(g);
});

test("compact grid: the holder alone", () => {
  const g = mapCompactGrid(POLARIS_MAP_LAYOUT, new Set([MAP_HOLDER]));
  assert.deepEqual(g, { columns: 3, rows: 1, cells: { [MAP_HOLDER]: { col: 1, span: 3, row: 1 } }, scale: 3 / 7 });
});

test("compact grid: every box used is the full grid", () => {
  const all = new Set(POLARIS_MAP_LAYOUT.nodes.map((n) => n.id));
  assert.deepEqual(
    mapCompactGrid(POLARIS_MAP_LAYOUT, all, () => true),
    mapFullGrid(POLARIS_MAP_LAYOUT),
  );
});

/** A small layout: three boxes in the holder's row, two others below. */
const SMALL = {
  id: "t",
  columns: 7,
  nodes: [
    { id: "l", band: "holder", col: 1, span: 1, row: 1, title: "L", blurb: "" },
    { id: MAP_HOLDER, band: "holder", col: 3, span: 3, row: 1, title: "H", blurb: "" },
    { id: "r", band: "holder", col: 7, span: 1, row: 1, title: "R", blurb: "" },
    { id: "x", band: "mechanism", col: 2, span: 1, row: 2, title: "X", blurb: "" },
    { id: "y", band: "mechanism", col: 6, span: 1, row: 2, title: "Y", blurb: "" },
  ],
  edges: [],
};

test("compact grid: a joined neighbour of the holder keeps a column for the receipt, the holder kept centred", () => {
  const joined = (a, b) => [a, b].sort().join() === [MAP_HOLDER, "l"].sort().join();
  const g = mapCompactGrid(SMALL, new Set(["l", MAP_HOLDER, "r"]), joined);
  // Column 2 stays for the arrow from L; column 6 goes, R joins the holder by
  // no arrow; one empty column at the right edge centres the holder.
  assert.equal(g.rows, 1);
  assert.equal(g.columns, 7);
  assert.deepEqual(g.cells.l, { col: 1, span: 1, row: 1 });
  assert.deepEqual(g.cells[MAP_HOLDER], { col: 3, span: 3, row: 1 });
  assert.deepEqual(g.cells.r, { col: 6, span: 1, row: 1 });
  assert.equal(centre(g.cells[MAP_HOLDER]), g.columns / 2);
  // Unjoined, both gaps go and the holder sits centred between L and R.
  const plain = mapCompactGrid(SMALL, new Set(["l", MAP_HOLDER, "r"]));
  assert.equal(plain.columns, 5);
  assert.deepEqual(plain.cells[MAP_HOLDER], { col: 2, span: 3, row: 1 });
});

test("compact grid: a row with no used box is dropped, and a column one row uses stays for all", () => {
  const g = mapCompactGrid(SMALL, new Set([MAP_HOLDER, "x"]));
  assert.equal(g.rows, 2);
  assert.deepEqual(rowsOf(g), [[MAP_HOLDER], ["x"]]);
  // Column 2 stays for X; the holder is padded on the right to stay centred.
  assert.deepEqual(g.cells.x, { col: 1, span: 1, row: 2 });
  assert.deepEqual(g.cells[MAP_HOLDER], { col: 2, span: 3, row: 1 });
  assert.equal(g.columns, 5);
  const top = mapCompactGrid(SMALL, new Set([MAP_HOLDER, "l"]));
  assert.equal(top.rows, 1);
});

test("nothing unused: only where every box is used and every arrow drawn", () => {
  for (const name of ["map-38d7", "map-c513"]) assert.equal(mapNothingUnused(POLARIS_MAP_LAYOUT, grid(name).f), false);
  const f = grid("map-38d7").f;
  const edges = Object.fromEntries(POLARIS_MAP_LAYOUT.edges.map((e) => [e.id, f.edges[Object.keys(f.edges)[0]]]));
  assert.equal(mapNothingUnused(POLARIS_MAP_LAYOUT, { ...f, edges }), true);
  // One direction of each pair is enough: the unused reverse is not drawn.
  const oneWay = Object.fromEntries(
    POLARIS_MAP_LAYOUT.edges.filter((e) => e.lane !== 1).map((e) => [e.id, edges[e.id]]),
  );
  assert.equal(mapNothingUnused(POLARIS_MAP_LAYOUT, { ...f, edges: oneWay }), true);
  assert.equal(mapNothingUnused(POLARIS_MAP_LAYOUT, { ...f, edges: {}, edgesUnknown: true }), true);
});

test("arrows unknown: every box is used, and the full grid is the layout as written", () => {
  const d = fx("map-38d7");
  d.status = "incomplete";
  d.rows = null;
  d.place_counts = null;
  const f = buildPethMapFill(d, CTX);
  assert.equal(f.edgesUnknown, true);
  const used = usedNodes(POLARIS_MAP_LAYOUT, f);
  assert.equal(used.size, POLARIS_MAP_LAYOUT.nodes.length);
  const full = mapFullGrid(POLARIS_MAP_LAYOUT);
  assert.equal(full.columns, 7);
  assert.equal(full.rows, 4);
  assert.equal(full.scale, 1);
  for (const n of POLARIS_MAP_LAYOUT.nodes)
    assert.deepEqual(full.cells[n.id], { col: n.col, span: n.span, row: n.row });
});

test("a partial read: arrows over the newest rows, boxes with their whole-ledger count kept", () => {
  const d = fx("map-c513");
  d.total_rows = 40000;
  d.place_counts = d.place_counts.map((c) => ({ ...c, rows: c.rows * 1000 }));
  const f = buildPethMapFill(d, CTX);
  assert.ok(f.counted.rows < f.counted.total);
  const used = usedNodes(POLARIS_MAP_LAYOUT, f);
  // Every box with a count of its own is kept, arrow or none.
  for (const [id, n] of Object.entries(f.nodes)) if ((n.rowCount ?? 0) > 0) assert.ok(used.has(id), id);
  const g = mapCompactGrid(POLARIS_MAP_LAYOUT, used, mapJoined(POLARIS_MAP_LAYOUT, f));
  assert.deepEqual(Object.keys(g.cells).sort(), [...used].sort());
  assertSound(g);
});

test("?routes=: all draws the whole layout; anything else, or none, the used routes", () => {
  assert.equal(mapRoutesFromParam("all"), "all");
  assert.equal(mapRoutesFromParam(new URLSearchParams("?map=a->b&routes=all").get("routes")), "all");
  assert.equal(mapRoutesFromParam("used"), "used");
  assert.equal(mapRoutesFromParam("ALL"), "used");
  assert.equal(mapRoutesFromParam(""), "used");
  assert.equal(mapRoutesFromParam(null), "used");
  const base = "https://x.test/sepolia/polaris/peth/0xab?map=polaris%3Azap-%3Eholder#peth-timeline";
  const on = mapRoutesHref(base, "all");
  assert.equal(new URL(on).searchParams.get("routes"), "all");
  assert.equal(new URL(on).searchParams.get("map"), "polaris:zap->holder");
  assert.equal(new URL(on).hash, "#peth-timeline");
  const off = mapRoutesHref(on, "used");
  assert.equal(new URL(off).searchParams.has("routes"), false);
  assert.equal(new URL(off).searchParams.get("map"), "polaris:zap->holder");
  assert.equal(mapRoutesFromParam(new URL(on).searchParams.get(MAP_ROUTES_PARAM)), "all");
  assert.equal(mapRoutesFromParam(new URL(off).searchParams.get(MAP_ROUTES_PARAM)), "used");
});
