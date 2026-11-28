// lib/polaris/peth-map-fill.ts — the Polaris map's fill for one address
// (ui-jobs 873): the route's rows summed by place into the layout's edges, and
// each box's "in" and "now". Fixtures: two production answers of
// GET /api/polaris/peth/:address read on 28 Nov 2026 (a CDP-and-loan address
// and a zaps-pools-svpETH one), with each row's `place` ADDED BY HAND, since
// the route does not send it before ui-jobs 872.
// Run: npm test
//
// The modules import their siblings by extensionless relative specifier, so
// this file registers a resolver that adds the `.ts`.
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

const { buildPethMapFill, pethMapPlaces, pethMapRowEdges } = await import("../../lib/polaris/peth-map-fill.ts");
const { POLARIS_MAP_LAYOUT, PM, pmEdge } = await import("../../lib/polaris/peth-map-layout.ts");
const { hotSets, MAP_HOLDER, mapExact, mapUnusedWords, mergeFillRows, usedNodes } = await import(
  "../../lib/shared/protocol-map/types.ts"
);

const fx = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/polaris-peth/${name}.json`, import.meta.url), "utf8"));

const T = (symbol, address) => ({ symbol, address });
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
  // Stand-ins for lib/polaris/peth-provenance.ts: each names its helper.
  receipts: {
    held: (what, block) => ({ kind: "chain", summary: `held ${what}`, source: { block } }),
    cdpTotal: (stored, block) => ({ kind: "chain-derived", summary: "cdpTotal", source: { block } }),
    cdp: (market, id, block) => ({ kind: "chain", summary: `cdp ${market} ${id}`, source: { block } }),
    spTotal: (stored, block) => ({ kind: "chain-derived", summary: "spTotal", source: { block } }),
    sp: (market, id, block) => ({ kind: "chain", summary: `sp ${market} ${id}`, source: { block } }),
    loanTotal: () => ({ kind: "chain-derived", summary: "loanTotal" }),
    loan: (id) => ({ kind: "chain-derived", summary: `loan ${id}` }),
    lpTotal: (block) => ({ kind: "chain-derived", summary: "lpTotal", source: { block } }),
    lp: (venue, block) => ({ kind: "chain-derived", summary: `lp ${venue}`, source: { block } }),
  },
};

/** An edge's amounts as { symbol: raw }. */
const sums = (fill, from, to) => {
  const e = fill.edges[pmEdge(from, to)];
  return e ? Object.fromEntries(e.amounts.map((a) => [a.asset, a.raw])) : null;
};
const rowsOn = (fill, from, to) => fill.edges[pmEdge(from, to)]?.rowCount ?? 0;
const add = (...xs) => xs.reduce((s, x) => s + BigInt(x), BigInt(0)).toString();

test("every edge joins two nodes of the layout, and every id is namespaced", () => {
  const ids = new Set(POLARIS_MAP_LAYOUT.nodes.map((n) => n.id));
  for (const e of POLARIS_MAP_LAYOUT.edges) {
    assert.ok(ids.has(e.from) && ids.has(e.to), e.id);
    assert.equal(e.protocol, "polaris");
  }
  for (const id of ids) assert.ok(id === MAP_HOLDER || id.startsWith("polaris:"), id);
  assert.equal(new Set(POLARIS_MAP_LAYOUT.edges.map((e) => e.id)).size, POLARIS_MAP_LAYOUT.edges.length);
});

test("CDPs and a loan: the zaps, the curve fees, the CDP and loan arrows, and the boxes' now", () => {
  const d = fx("map-38d7");
  const f = buildPethMapFill(d, CTX);
  assert.deepEqual(sums(f, PM.eth, PM.zap), { WETH: "30000000000000000000" });
  assert.equal(sums(f, PM.eth, PM.zap).WETH, d.figures.eth_in.raw);
  assert.deepEqual(sums(f, PM.zap, MAP_HOLDER), { pETH: "11457336014283415572", fpETH: "8778050067873262182" });
  assert.equal(rowsOn(f, PM.zap, PM.curve), 2);
  assert.deepEqual(f.edges[pmEdge(PM.zap, PM.curve)].amounts, []);
  assert.deepEqual(sums(f, PM.curve, PM.fee), { pETH: d.figures.curve_fees_paid.raw });
  assert.deepEqual(sums(f, MAP_HOLDER, PM.cdp), { pETH: "11000000000000000000" });
  assert.equal(rowsOn(f, MAP_HOLDER, PM.cdp), 2);
  assert.deepEqual(sums(f, MAP_HOLDER, PM.loan), { fpETH: "5000000000000000000" });
  assert.equal(f.edges[pmEdge(MAP_HOLDER, PM.cdp)].timelineHref, CTX.timelineHref(pmEdge(MAP_HOLDER, PM.cdp)));
  // Nothing else is drawn: the rest of the layout stays dashed.
  assert.deepEqual(
    Object.keys(f.edges).sort(),
    [
      pmEdge(PM.eth, PM.zap),
      pmEdge(PM.zap, PM.curve),
      pmEdge(PM.curve, PM.fee),
      pmEdge(PM.zap, MAP_HOLDER),
      pmEdge(MAP_HOLDER, PM.cdp),
      pmEdge(MAP_HOLDER, PM.loan),
    ].sort(),
  );
  assert.ok(!usedNodes(POLARIS_MAP_LAYOUT, f).has(PM.svpeth));

  const cdp = f.nodes[PM.cdp].lines;
  assert.deepEqual(
    { label: cdp[0].label, amounts: cdp[0].amounts },
    {
      label: "in",
      amounts: [{ asset: "pETH", address: CTX.peth.address, raw: "11000000000000000000", decimals: 18 }],
    },
  );
  assert.equal(cdp[1].label, "now");
  assert.equal(cdp[1].amounts[0].raw, "10925000000000000000");
  assert.deepEqual(
    cdp.slice(2, 4).map((l) => l.text),
    ["GOLDp CDP #22", "USDp CDP #36"],
  );
  const loan = f.nodes[PM.loan].lines;
  assert.equal(loan.find((l) => l.label === "now").amounts[0].raw, "5000000000000000000");
  const holder = f.nodes[MAP_HOLDER].lines[0];
  assert.deepEqual(
    holder.amounts.map((a) => [a.asset, a.raw]),
    [
      ["pETH", "457336014283415572"],
      ["fpETH", "3778050067873262182"],
    ],
  );
  assert.deepEqual(f.counted, { rows: 5, total: 5 });
  assert.equal(f.subject.asOf.block, "12229142");
});

test("zaps, pools and svpETH: only pETH and fpETH zaps carry ETH, other tokens show what was bought", () => {
  const d = fx("map-c513");
  const f = buildPethMapFill(d, CTX);
  // ETH in counts only pETH and fpETH trades: the vpETH, USDp, GOLDp and
  // POLAR zaps put no ETH on the arrow.
  assert.deepEqual(sums(f, PM.eth, PM.zap), { WETH: d.figures.eth_in.raw });
  assert.equal(rowsOn(f, PM.eth, PM.zap), 2);
  assert.deepEqual(sums(f, PM.zap, PM.other), {
    POLAR: "7757532577271558962114",
    GOLDp: "3946341956775913294",
    USDp: "18253556104813665056993",
  });
  assert.deepEqual(sums(f, PM.zap, MAP_HOLDER), {
    pETH: add("30022958098542002368", "1763740298406792640"),
    fpETH: add("6751486196227623066", "17815558569765583"),
    vpETH: add("45152302212963898885", "17824851655933580"),
  });
  assert.equal(rowsOn(f, PM.zap, MAP_HOLDER), 4);
  assert.deepEqual(sums(f, MAP_HOLDER, PM.zap), { fpETH: "2107623962359256268" });
  assert.deepEqual(sums(f, PM.curve, PM.fee), { pETH: d.figures.curve_fees_paid.raw });
  // The contract receipt has no place (872): it counts on "Other addresses".
  assert.deepEqual(sums(f, PM.outside, MAP_HOLDER), { pETH: "20753615371910740758" });
  // Pool shares minted to the address are not an arrow amount.
  assert.deepEqual(sums(f, MAP_HOLDER, PM.pools), {
    pETH: add("3792612591202789368", "5776573470452743126"),
    fpETH: "4643862233868366798",
    vpETH: "25152302212963898885",
  });
  assert.deepEqual(sums(f, MAP_HOLDER, PM.svpeth), { vpETH: "20000000000000000000" });

  const pools = f.nodes[PM.pools].lines;
  assert.equal(pools[1].label, "now");
  assert.equal(pools[1].amounts[0].raw, add("4743676835997797599", "39472805181981179296"));
  assert.equal(pools.filter((l) => l.label === "note").length, 2);
  const sv = f.nodes[PM.svpeth].lines;
  assert.equal(sv.find((l) => l.label === "now").amounts[0].raw, "19999713948939849029");
  assert.equal(sv.find((l) => l.text === "Converts to").amounts[0].raw, "20053398120281420363");
  assert.deepEqual(
    f.nodes[MAP_HOLDER].lines[0].amounts.map((a) => a.asset),
    ["pETH", "fpETH", "vpETH", "svpETH"],
  );
  assert.match(f.nodes[PM.fee].lines[0].text, /not read yet/);
});

test("the fill carries no gain, and the browser gets a few dozen figures", () => {
  for (const name of ["map-38d7", "map-c513"]) {
    const f = buildPethMapFill(fx(name), CTX);
    const json = JSON.stringify(f);
    assert.ok(!/gain|pnl|profit/i.test(json), name);
    const figures = Object.values(f.edges).reduce((s, e) => s + e.amounts.length, 0);
    assert.ok(figures < 40, `${name}: ${figures}`);
  }
});

test("past the first read, arrows count rows and carry no amount; boxes give the whole ledger's count", () => {
  const d = fx("map-c513");
  d.total_rows = 40000;
  d.place_counts = d.place_counts.map((c) => ({ ...c, rows: c.rows * 1000 }));
  const f = buildPethMapFill(d, CTX);
  assert.deepEqual(f.counted, { rows: 11, total: 40000 });
  for (const e of Object.values(f.edges)) assert.deepEqual(e.amounts, []);
  assert.equal(rowsOn(f, PM.zap, MAP_HOLDER), 4);
  assert.equal(f.nodes[PM.zap].rowCount, 7000);
  assert.equal(f.nodes[PM.pools].rowCount, 2000);
  assert.ok(f.nodes[PM.zap].lines.some((l) => l.text === "7,000 transactions in all"));
});

for (const status of ["incomplete", "too_heavy"]) {
  test(`a ledger ${status}: no arrows, no box marked unused, the boxes' now kept`, () => {
    const d = fx("map-38d7");
    d.status = status;
    d.rows = null;
    d.place_counts = null;
    const f = buildPethMapFill(d, CTX);
    assert.equal(f.edgesUnknown, true);
    assert.deepEqual(f.edges, {});
    assert.deepEqual(f.counted, { rows: 0, total: 0 });
    assert.equal(f.nodes[PM.cdp].lines[0].label, "now");
    assert.equal(usedNodes(POLARIS_MAP_LAYOUT, f).size, POLARIS_MAP_LAYOUT.nodes.length);
  });
}

test("the adapter splits a row's `places` among its lines", () => {
  const d = fx("map-c513");
  const zap = d.rows[0];
  const lp = d.rows[1];
  // A zap and a pool deposit in one transaction, as 872 may send it.
  const both = {
    ...zap,
    lines: [...zap.lines, ...lp.lines],
    place: zap.place,
    places: [...zap.places, ...lp.places],
  };
  const groups = pethMapPlaces(both);
  assert.deepEqual(
    groups.map((g) => [g.kind, g.lines.length]),
    [
      ["zap", 4],
      ["venue", 4],
    ],
  );
  const edges = pethMapRowEdges(both, CTX).sort();
  assert.ok(edges.includes(pmEdge(MAP_HOLDER, PM.pools)));
  assert.ok(edges.includes(pmEdge(PM.zap, MAP_HOLDER)));
});

test("a selection lights its edges, nodes and rows", () => {
  const d = fx("map-38d7");
  const f = buildPethMapFill(d, CTX);
  const cdpIn = pmEdge(MAP_HOLDER, PM.cdp);
  const e = hotSets(POLARIS_MAP_LAYOUT, f, { type: "edge", id: cdpIn });
  assert.deepEqual([...e.edges], [cdpIn]);
  assert.equal(e.rows.size, 2);
  const zapRow = d.rows.find((r) => r.kind === "zap_in").tx_hash.toLowerCase();
  const r = hotSets(POLARIS_MAP_LAYOUT, f, { type: "row", id: zapRow });
  assert.ok(r.edges.has(pmEdge(PM.eth, PM.zap)) && r.edges.has(pmEdge(PM.curve, PM.fee)));
  assert.deepEqual([...r.rows], [zapRow]);
  const n = hotSets(POLARIS_MAP_LAYOUT, f, { type: "node", id: PM.zap });
  assert.equal(n.rows.size, 2);
  assert.ok(n.nodes.has(PM.eth) && n.nodes.has(MAP_HOLDER));
  assert.equal(mapExact({ asset: "pETH", raw: "10925000000000000000", decimals: 18 }), "10.925");
});

test("fpETH and vpETH transfers sum on the Other addresses box", () => {
  const d = fx("map-c513");
  const r = d.rows.find((x) => x.kind === "contract_receive");
  const line = r.lines[0];
  d.rows = [
    {
      ...r,
      tx_hash: "0x" + "1".repeat(64),
      kind: "wallet_receive",
      lines: [
        { ...line, token: "fpeth", amount_raw: "3" },
        { ...line, token: "vpeth", amount_raw: "4" },
      ],
    },
    {
      ...r,
      tx_hash: "0x" + "2".repeat(64),
      kind: "wallet_send",
      lines: [{ ...line, token: "vpeth", direction: "out", amount_raw: "5" }],
    },
  ];
  d.total_rows = 2;
  const f = buildPethMapFill(d, CTX);
  assert.deepEqual(sums(f, PM.outside, MAP_HOLDER), { fpETH: "3", vpETH: "4" });
  assert.deepEqual(sums(f, MAP_HOLDER, PM.outside), { vpETH: "5" });
});

test("places not served: no arrows, no untouched boxes, the boxes' now kept", () => {
  for (const name of ["map-38d7", "map-c513"]) {
    const d = fx(name);
    for (const r of d.rows) {
      delete r.place;
      delete r.places;
    }
    delete d.place_counts;
    const f = buildPethMapFill(d, CTX);
    assert.equal(f.edgesUnknown, true, name);
    assert.deepEqual(f.edges, {}, name);
    // No row's arrows go to the browser while the arrows are unknown.
    assert.deepEqual(f.rows, []);
    assert.ok(f.nodes[MAP_HOLDER].lines[0].label === "now");
    // Every box reads as known-unknown: none is marked untouched.
    assert.equal(usedNodes(POLARIS_MAP_LAYOUT, f).size, POLARIS_MAP_LAYOUT.nodes.length);
    // A contract receipt is not drawn as a transfer.
    assert.equal(f.edges[pmEdge(PM.outside, MAP_HOLDER)], undefined);
  }
});

test("a served row with place null is still a transfer", () => {
  const d = fx("map-c513");
  delete d.place_counts;
  const f = buildPethMapFill(d, CTX);
  assert.equal(f.edgesUnknown, undefined);
  assert.deepEqual(sums(f, PM.outside, MAP_HOLDER), { pETH: "20753615371910740758" });
});

test("a row with several places gives its ETH to the curve, else the splitter", () => {
  const d = fx("map-38d7");
  const cdpRow = d.rows.find((r) => r.kind === "cdp_deposit");
  const curve = { kind: "curve", address: "0x07ea2ff889e6228cded329a09f66e370f12c705e" };
  const venue = { kind: "venue", market: "venue_curve_tripool", address: "0x28b6f412904834dee78a4fa464f2089f5264770c" };
  const splitter = { kind: "splitter", address: "0x94220c1c340336527c719bcf06067ca7769ac185" };
  const row = (places, n) => ({
    ...cdpRow,
    tx_hash: "0x" + String(n).repeat(64),
    eth_in_raw: "7",
    curve_fee_raw: "2",
    place: places[0],
    places,
  });
  d.rows = [row([cdpRow.place, curve], 1), row([venue, curve], 2), row([venue, splitter], 3)];
  d.total_rows = 3;
  const f = buildPethMapFill(d, CTX);
  assert.deepEqual(sums(f, MAP_HOLDER, PM.curve), { WETH: "14" });
  assert.deepEqual(sums(f, MAP_HOLDER, PM.splitter), { WETH: "7" });
  // The fee sits on a curve row only.
  assert.deepEqual(sums(f, PM.curve, PM.fee), { pETH: "4" });
  assert.equal(sums(f, MAP_HOLDER, PM.cdp).WETH, undefined);
  assert.equal(sums(f, MAP_HOLDER, PM.pools).WETH, undefined);
});

test("native ETH into a zap carries the ETH icon by symbol", () => {
  const d = fx("map-38d7");
  for (const r of d.rows) if (r.zap) r.zap.token_in = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const f = buildPethMapFill(d, CTX);
  const a = f.edges[pmEdge(PM.eth, PM.zap)].amounts;
  assert.deepEqual(a, [{ asset: "ETH", raw: "30000000000000000000", decimals: 18 }]);
});

test("every summed figure carries its receipt: the rows and the block", () => {
  const f = buildPethMapFill(fx("map-c513"), CTX);
  const e = f.edges[pmEdge(PM.zap, MAP_HOLDER)];
  assert.equal(e.receipt.rows, 4);
  assert.equal(e.receipt.pclass, "indexed");
  assert.deepEqual(e.receipt.source, { block: "12229120" });
  assert.equal(
    e.receipt.summary,
    "Zap router → This address — the amounts this address moved along this arrow, summed over 4 transactions.",
  );
  assert.equal(e.receipt.formula, "Σ amount over this arrow's transactions");
  const pools = f.nodes[PM.pools].lines;
  assert.match(pools[0].receipt.summary, /^Pools, in — the amounts this address put into it, summed over 2 /);
  // A box's "now" takes the places section's receipt.
  assert.deepEqual(pools[1].receipt, { kind: "chain-derived", summary: "lpTotal", source: { block: "12229142" } });
  assert.deepEqual(
    f.nodes[MAP_HOLDER].lines[0].amounts.map((a) => a.receipt.summary),
    ["held peth", "held fpeth", "held vpeth", "held svpeth"],
  );
  assert.equal(f.nodes[PM.svpeth].lines.find((l) => l.text === "Converts to").receipt.summary, "held svpethVpeth");
  for (const n of Object.values(f.nodes))
    for (const l of n.lines) for (const a of l.amounts) assert.ok(a.receipt ?? l.receipt, JSON.stringify(l));
});

test("a box counts each row once; past the first read, several places count visits", () => {
  const d = fx("map-c513");
  const f = buildPethMapFill(d, CTX);
  assert.equal(f.nodes[PM.pools].rowCount, 2);
  assert.equal(f.nodes[PM.zap].rowCount, 7);
  const two = fx("map-c513");
  const lp = two.rows.find((r) => r.kind === "lp_add");
  const other = two.rows.filter((r) => r.kind === "lp_add")[1];
  lp.places = [...lp.places, ...other.places];
  assert.equal(buildPethMapFill(two, CTX).nodes[PM.pools].rowCount, 2);
  two.total_rows = 900;
  const partial = buildPethMapFill(two, CTX);
  assert.ok(partial.nodes[PM.pools].lines.some((l) => l.text === "2 transactions across 2 pools"));
  assert.ok(partial.nodes[PM.zap].lines.some((l) => l.text === "7 transactions in all"));
});

test("the CDP, deposit and loan boxes take the places section's receipts", () => {
  const f = buildPethMapFill(fx("map-38d7"), CTX);
  const cdp = f.nodes[PM.cdp].lines;
  assert.deepEqual(cdp[1].receipt, { kind: "chain-derived", summary: "cdpTotal", source: { block: "11514797" } });
  assert.deepEqual(
    cdp.filter((l) => l.text?.includes("CDP #")).map((l) => l.receipt.summary),
    ["cdp goldp 22", "cdp usdp 36"],
  );
  const loan = f.nodes[PM.loan].lines;
  assert.equal(loan.find((l) => l.label === "now").receipt.summary, "loanTotal");
  assert.equal(loan.find((l) => l.text === "Reserve loan #28").receipt.summary, "loan 28");
  const d = fx("map-38d7");
  d.rollup.sp_peth = {
    raw: "3",
    source: "x",
    items: [
      { market: "usdp", token_id: "3", peth_raw: "1", deposit_raw: "0", as_of_block: "10", as_of_tx: "0xa" },
      { market: "goldp", token_id: "4", peth_raw: "2", deposit_raw: "0", as_of_block: "12", as_of_tx: "0xb" },
    ],
  };
  const sp = buildPethMapFill(d, CTX).nodes[PM.sp].lines;
  // The total stands at the latest deposit's block.
  assert.deepEqual(sp[0].receipt, { kind: "chain-derived", summary: "spTotal", source: { block: "12" } });
  assert.deepEqual(
    sp.slice(1).map((l) => l.receipt.summary),
    ["sp usdp 3", "sp goldp 4"],
  );
});

test("past the first read, a dashed arrow reads as unused in the newest rows", () => {
  const d = fx("map-c513");
  assert.equal(mapUnusedWords(buildPethMapFill(d, CTX)), "Not used by this address");
  d.total_rows = 600;
  const f = buildPethMapFill(d, CTX);
  assert.equal(mapUnusedWords(f), "Not used in the newest 11 transactions");
  // No arrow is drawn from place_counts: only the rows read fill an arrow.
  for (const id of Object.keys(f.edges))
    assert.ok(
      f.rows.some((r) => r.edgeIds.includes(id)),
      id,
    );
});

test("older rows merged in recount the rows and each arrow's count", () => {
  const d = fx("map-38d7");
  d.total_rows = 7;
  const f = buildPethMapFill(d, CTX);
  assert.deepEqual(f.counted, { rows: 5, total: 7 });
  const cdpIn = pmEdge(MAP_HOLDER, PM.cdp);
  assert.equal(f.edges[cdpIn].rowCount, 2);
  const m = mergeFillRows(f, [
    { id: "0x" + "a".repeat(64), edgeIds: [cdpIn] },
    { id: "0x" + "b".repeat(64), edgeIds: [] },
    { id: f.rows[0].id, edgeIds: [cdpIn] },
  ]);
  assert.deepEqual(m.counted, { rows: 7, total: 7 });
  assert.equal(m.edges[cdpIn].rowCount, 3);
  assert.equal(m.edges[pmEdge(PM.eth, PM.zap)].rowCount, 2);
  assert.equal(m.rows.length, 7);
  // An arrow only the added rows use stays unfilled.
  assert.equal(
    mergeFillRows(f, [{ id: "0xc", edgeIds: [pmEdge(MAP_HOLDER, PM.sp)] }]).edges[pmEdge(MAP_HOLDER, PM.sp)],
    undefined,
  );
});

test("amounts exist only over a ledger read in full, and a merge never keeps them beside a larger count", () => {
  // Read in full: amounts, and nothing older to load.
  const full = buildPethMapFill(fx("map-38d7"), CTX);
  assert.equal(full.counted.rows, full.counted.total);
  assert.ok(Object.values(full.edges).some((e) => e.amounts.length > 0));
  // Rows left to read: no amounts.
  const d = fx("map-38d7");
  d.total_rows = 9;
  const partial = buildPethMapFill(d, CTX);
  assert.ok(Object.values(partial.edges).every((e) => e.amounts.length === 0));
  // Should amounts meet added rows, the merge drops them.
  const m = mergeFillRows(full, [{ id: "0x" + "d".repeat(64), edgeIds: [pmEdge(MAP_HOLDER, PM.cdp)] }]);
  assert.ok(Object.values(m.edges).every((e) => e.amounts.length === 0));
  assert.equal(m.edges[pmEdge(MAP_HOLDER, PM.cdp)].rowCount, 3);
  // A merge that adds nothing changes nothing.
  assert.equal(mergeFillRows(full, []), full);
});
