// lib/polaris/peth-map-explanation.ts — the Polaris map's explanation drawer
// (ui-jobs 873.5), built from the map's fill. Checks zone Z1's limits on
// every bullet (rails-ops standards/prose-limits-and-zones.md §2.1), that
// every figure is a fill figure with the map's receipt, that no gain is
// stated, and that the untouched line names the dashed boxes, on both
// fixtures and in the partial and unknown states.
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
const { pethMapExplanation } = await import("../../lib/polaris/peth-map-explanation.ts");
const { POLARIS_LOAN_NAME, POLARIS_LOAN_ONE, POLARIS_MAP_LAYOUT, POLARIS_POOL_NAME, PM, pmEdge } = await import(
  "../../lib/polaris/peth-map-layout.ts"
);
const TYPES = await import("../../lib/shared/protocol-map/types.ts");
const { MAP_HOLDER, mapExact, mapPartText, mapSeries, mapUnusedWords, usedNodes } = TYPES;

const fx = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/polaris-peth/${name}.json`, import.meta.url), "utf8"));

const T = (symbol, address) => ({ symbol, address });
const R = (summary) => ({ kind: "chain", summary });
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
  // The page's names (lib/polaris/peth-map-context.ts).
  venueLabel: {
    venue_curve_tripool: "Curve pool",
    venue_univ2_polar_peth: "pETH/POLAR pair",
    venue_univ2_peth_weth: "pETH/WETH pair",
  },
  timelineHref: (id) => `/sepolia/polaris/peth/x?map=${encodeURIComponent(id)}`,
  receipts: {
    held: (what) => R(`held ${what}`),
    cdpTotal: () => R("cdpTotal"),
    cdp: (market, id) => R(`cdp ${market} ${id}`),
    spTotal: () => R("spTotal"),
    sp: (market, id) => R(`sp ${market} ${id}`),
    loanTotal: () => R("loanTotal"),
    loan: (id) => R(`loan ${id}`),
    lpTotal: () => R("lpTotal"),
    lp: (venue) => R(`lp ${venue}`),
  },
};
const XC = {
  eventHref: (id, later) => (later ? `/sepolia/polaris/peth/x/event/${id}` : `/sepolia/polaris/peth/x?at=${id}`),
  edgesHref: (ids) => `/sepolia/polaris/peth/x?map=${ids.join(",")}#peth-timeline`,
  marketOrder: ["USDp", "GOLDp"],
};

const exact = (a) => mapExact(a);
const text = (parts) => parts.map((p) => mapPartText(p, exact)).join("");

// ── The fills under test ──
const full = (name) => buildPethMapFill(fx(name), CTX);
/** The ledger longer than the page read: the arrows count the newest rows. */
const partial = (name) => {
  const d = fx(name);
  d.total_rows = d.rows.length + 495;
  return buildPethMapFill(d, CTX);
};
/** No place served for any row: the arrows are unknown. */
const unknown = (name) => {
  const d = fx(name);
  for (const r of d.rows) {
    delete r.place;
    delete r.places;
  }
  delete d.place_counts;
  return buildPethMapFill(d, CTX);
};
const CASES = ["map-38d7", "map-c513"].flatMap((n) => [
  [`${n}`, full(n)],
  [`${n} partial`, partial(n)],
  [`${n} unknown`, unknown(n)],
]);

// ── Z1, by the check's rule (§2): a figure with its unit, a time or a span
// is one word and one figure; a series' commas list and join no clause. ──
const JOINS = /[,;:—–]/g;
function measure(parts) {
  let words = 0;
  let figures = 0;
  let joins = 0;
  for (const p of parts) {
    if (typeof p === "string" || "link" in p) {
      const s = typeof p === "string" ? p : p.link;
      joins += (s.match(JOINS) ?? []).length;
      words += s
        .replace(/[.,;:—–…]/g, " ")
        .split(/\s+/)
        .filter(Boolean).length;
    } else if ("list" in p) {
      words += mapSeries(p.list).replace(/,/g, " ").split(/\s+/).filter(Boolean).length;
    } else {
      words += 1;
      figures += 1;
    }
  }
  return { words, figures, joins };
}

const GAIN =
  /\b(gain|gains|gained|profit|profits|loss|losses|lost|P&L|PnL|up by|down by|more than|less than|return|returns|earned)\b/i;
const JUDGE =
  /\b(safe|safer|risky|riskier|healthy|dangerous|good|bad|cheap|expensive|protect|opportunity|should|recommend|you|your)\b/i;
const MACHINERY = /\b(fill|route|server|Rails|index|indexed|decoded|row|rows)\b/;

/** Every group of every tab, and one tab's groups. */
const all = (x) => x.tabs.flatMap((t) => t.groups);
const tab = (x, key) => x.tabs.find((t) => t.key === key)?.groups ?? [];
const bulletCount = (groups) => groups.reduce((n, g) => n + g.bullets.length, 0);

/** Z1's pane (§2.1): 8 bullets, 4 groups, 150 words over bullets and headings,
 *  3 words a heading. */
function assertPane(groups, label) {
  for (const g of groups) assert.ok(g.bullets.length <= 4, `${label} ${g.id}: ${g.bullets.length} bullets`);
  assert.ok(bulletCount(groups) <= 8, `${label}: ${bulletCount(groups)} bullets`);
  assert.ok(groups.length <= 4, `${label}: ${groups.length} groups`);
  const words = groups.reduce(
    (n, g) =>
      n +
      (g.heading ? g.heading.split(/\s+/).length : 0) +
      (g.lead ? measure(g.lead).words : 0) +
      g.bullets.reduce((m, b) => m + measure(b.parts).words, 0),
    0,
  );
  assert.ok(words <= 150, `${label}: ${words} words`);
  for (const g of groups) if (g.heading) assert.ok(g.heading.split(/\s+/).length <= 3, `heading "${g.heading}"`);
}

for (const [name, fill] of CASES) {
  const x = pethMapExplanation(fill, XC);

  test(`${name}: each tab's pane keeps Z1's limits`, () => {
    assert.deepEqual(
      x.tabs.map((t) => [t.key, t.label]),
      [
        ["explanation", "Explanation"],
        ["parts", "Parts"],
      ],
    );
    for (const t of x.tabs) assertPane(t.groups, `${name} ${t.key}`);
  });

  test(`${name}: every bullet keeps Z1's limits`, () => {
    for (const g of all(x)) {
      assert.ok(g.bullets.length <= 4, `${g.id}: ${g.bullets.length} bullets`);
      if (g.lead) {
        const m = measure(g.lead);
        assert.ok(m.words <= 25 && m.figures <= 2 && m.joins <= 2, `${g.id} lead: ${JSON.stringify(m)}`);
      }
      for (const b of g.bullets) {
        const m = measure(b.parts);
        const t = text(b.parts);
        assert.ok(m.words <= 20, `${m.words} words: ${t}`);
        assert.ok(m.figures <= 2, `${m.figures} figures: ${t}`);
        assert.ok(m.joins <= 2, `${m.joins} joining marks: ${t}`);
      }
    }
  });

  test(`${name}: no gain, no judgement, no machinery, and this address the subject`, () => {
    for (const g of all(x))
      for (const parts of [g.lead ?? [], ...g.bullets.map((b) => b.parts)]) {
        const t = text(parts);
        assert.doesNotMatch(t, GAIN, t);
        assert.doesNotMatch(t, JUDGE, t);
        assert.doesNotMatch(t, MACHINERY, t);
        assert.doesNotMatch(t, /\bFee router\b|\bZap router\b(?!:)/, t);
      }
  });

  test(`${name}: every figure is a fill figure, with the map's receipt`, () => {
    // Each fill amount and the receipt the map draws it with.
    // An amount the map shows twice (an arrow's sum and its box's "in") has both receipts.
    const known = new Map();
    const put = (a, r) => known.set(a, new Set([...(known.get(a) ?? []), r]));
    for (const e of Object.values(fill.edges)) for (const a of e.amounts) put(a, a.receipt ?? e.receipt);
    for (const n of Object.values(fill.nodes))
      for (const l of n.lines) for (const a of l.amounts) put(a, a.receipt ?? l.receipt);
    for (const g of all(x))
      for (const parts of [g.lead ?? [], ...g.bullets.map((b) => b.parts)])
        for (const p of parts) {
          if (typeof p === "object" && "figure" in p) {
            assert.ok(known.has(p.figure), `${text([p])} is not a fill amount`);
            assert.ok(known.get(p.figure).has(p.receipt), `${text([p])} receipt`);
          }
          // Words carry no number of their own: a place's "#28", and the
          // count of the rows read, are the only digits.
          if (typeof p === "string" || (typeof p === "object" && "link" in p)) {
            const s = (typeof p === "string" ? p : p.link)
              .replace(/#\d+/g, "")
              .replace(fill.counted.rows.toLocaleString("en-US"), "");
            const skipped = s.match(/^(\d+) more steps?$/);
            assert.ok(!/\d/.test(skipped ? "" : s), `a number in words: ${s}`);
          }
        }
  });

  test(`${name}: the untouched line names the dashed boxes`, () => {
    const line = tab(x, "parts").find((g) => g.id === "unused");
    if (fill.edgesUnknown) {
      assert.equal(line, undefined);
      return;
    }
    const used = usedNodes(POLARIS_MAP_LAYOUT, fill);
    const dashed = POLARIS_MAP_LAYOUT.nodes.filter((n) => n.band === "mechanism" && !used.has(n.id));
    const parts = line.bullets[0].parts;
    assert.equal(parts[0], `${mapUnusedWords(fill)}: `);
    const names = parts[1].list;
    assert.equal(names.length, dashed.length);
    // Each name is its box's title, as prose writes it.
    names.forEach((nm, i) =>
      assert.equal(nm.replace(/^the /, "").toLowerCase(), dashed[i].title.toLowerCase(), `${nm} / ${dashed[i].title}`),
    );
  });

  test(`${name}: the state's groups`, () => {
    const ids = tab(x, "explanation").map((g) => g.id);
    const partIds = tab(x, "parts").map((g) => g.id);
    if (fill.edgesUnknown) {
      // Only what sits where now, and the parts that hold it.
      assert.deepEqual(
        ids.filter((id) => !id.startsWith("now")),
        [],
      );
      assert.ok(ids.includes("now"));
      assert.deepEqual(partIds, ["parts"]);
      for (const g of all(x)) for (const b of g.bullets) assert.ok(!b.parts.some((p) => p.when), "no time");
      return;
    }
    assert.equal(ids[0], "did");
    assert.ok(ids.includes("now"));
    assert.deepEqual(partIds, ["parts", "unused"]);
    const did = tab(x, "explanation")[0];
    if (fill.counted.rows < fill.counted.total) {
      assert.equal(text(did.lead), `These steps cover the newest ${fill.counted.rows} transactions.`);
      // The arrows carry no amounts past the first read, so the story states none.
      for (const g of all(x).filter((g) => g.id === "did" || g.id === "then"))
        for (const b of g.bullets) assert.ok(!b.parts.some((p) => p.figure), text(b.parts));
    } else assert.equal(did.lead, undefined);
  });
}

test("0x38d7: the drawer's words", () => {
  const x = pethMapExplanation(full("map-38d7"), XC);
  const words = (key) => tab(x, key).map((g) => [g.heading ?? null, g.bullets.map((b) => text(b.parts))]);
  assert.deepEqual(words("explanation"), [
    [
      "Its steps",
      [
        "First, from 18 Aug 2026, 11:26 to 11:28, it paid 30 WETH through the zap router for pETH and fpETH.",
        "The bonding curve charged 0.173605765590902838 pETH in fees.",
      ],
    ],
    [
      null,
      [
        "Then, from 11:28 to 11:29, it put 11 pETH into USDp CDP #36 and GOLDp CDP #22.",
        `Most recently, at 11:30, it put 5 fpETH into ${POLARIS_LOAN_ONE} #28 as collateral.`,
      ],
    ],
    ["Now", [`Its CDPs held 10.925 pETH at their last touch, and ${POLARIS_LOAN_ONE} #28 holds 5 fpETH.`]],
  ]);
  assert.deepEqual(words("parts"), [
    [
      null,
      [
        "Zap router: one-click trades between ETH and Polaris tokens.",
        "Bonding curve: mints pETH against ETH and burns pETH to release ETH; its fees go to the fee router.",
        "CDPs: lock pETH as collateral to mint USDp or GOLDp.",
        `${POLARIS_LOAN_NAME}: borrow ETH from the bonding curve reserve against fpETH collateral.`,
      ],
    ],
    [
      null,
      [
        `Not used by this address: the ${POLARIS_POOL_NAME}, the Splitter, the pools, the svpETH vault and Morpho Blue.`,
      ],
    ],
  ]);
  // Each time links to its event on the timeline: the arrow's first, and its last.
  const first = tab(x, "explanation")[0].bullets[0].parts.find((p) => p.when).when;
  const f = full("map-38d7").edges[pmEdge(PM.eth, PM.zap)];
  assert.equal(first.from.href, XC.eventHref(f.first.id, false));
  assert.equal(first.to.href, XC.eventHref(f.last.id, false));
  // The CDPs' "?" opens Polaris's market modal.
  assert.equal(tab(x, "parts")[0].bullets[2].learnMore, "market");
});

test("0xc513: all seven steps, in order, and Now's one bullet", () => {
  const x = pethMapExplanation(full("map-c513"), XC);
  const g = tab(x, "explanation");
  assert.deepEqual(
    g.map((x) => [x.id, x.heading ?? null, x.bullets.length]),
    [
      ["did", "Its steps", 4],
      ["then", null, 3],
      ["now", "Now", 1],
    ],
  );
  assert.ok(!g.some((x) => x.id === "more"), "no more-steps line");
  assert.equal(bulletCount(g), 8);
  const did = g[0].bullets.map((b) => text(b.parts));
  assert.match(did[0], /^First, from 18 Aug 2026, 04:09 to 04:18, it paid 60 WETH through the zap router/);
  assert.match(did[1], /^The bonding curve charged 0\.3637\d+ pETH in fees\.$/);
  assert.match(did[2], /^At 04:10, it received 20\.75\d+ pETH from other addresses\.$/);
  assert.equal(did[3], "From 04:14 to 04:20, it bought vpETH, USDp, GOLDp and POLAR through the zap router.");
  assert.deepEqual(
    g[1].bullets.map((b) => text(b.parts)),
    [
      "Then, at 04:21, it staked 20 vpETH in the svpETH vault.",
      "From 04:30 to 04:33, it put 9.569186061655532494 pETH with fpETH and vpETH into the pools.",
      "Most recently, at 04:34, it sold 2.107623962359256268 fpETH through the zap router.",
    ],
  );
  // Now: the mechanisms' figures only; the svpETH the address holds is a balance.
  assert.deepEqual(
    g[2].bullets.map((b) => text(b.parts)),
    ["Its pool shares hold 44.216482017978976895 pETH, and its svpETH converts to 20.053398120281420363 vpETH."],
  );
  assert.equal(
    text(tab(x, "parts").find((g) => g.id === "unused").bullets[0].parts),
    `Not used by this address: CDPs, the ${POLARIS_POOL_NAME}, ${POLARIS_LOAN_NAME}, the Splitter and Morpho Blue.`,
  );
});

test("Now states no balance of the address on either fixture", () => {
  for (const name of ["map-38d7", "map-c513"])
    for (const fill of [full(name), partial(name), unknown(name)]) {
      const held = new Set((fill.nodes[MAP_HOLDER]?.lines ?? []).flatMap((l) => l.amounts));
      for (const g of all(pethMapExplanation(fill, XC)))
        for (const b of g.bullets) {
          assert.doesNotMatch(text(b.parts), /\bholds? now\b|\bnow holds\b|\balso holds\b/, name);
          for (const p of b.parts) assert.ok(!(typeof p === "object" && held.has(p.figure)), `${name}: a balance`);
        }
    }
});

test("arrows unknown and nothing in a mechanism: no Explanation tab, since the map's note says why", () => {
  const fill = {
    subject: { address: "0x", chain: "sepolia", asOf: { block: null, time: null } },
    nodes: {
      [MAP_HOLDER]: {
        lines: [{ label: "now", amounts: [{ asset: "pETH", raw: "1", decimals: 18 }], receipt: R("held") }],
      },
    },
    edges: {},
    rows: [],
    counted: { rows: 0, total: 3 },
    edgesUnknown: true,
  };
  assert.deepEqual(pethMapExplanation(fill, XC).tabs, []);
});

test("0xc513 partial: the other tokens' bullet names none and keeps its span", () => {
  const x = pethMapExplanation(partial("map-c513"), XC);
  const t = all(x).flatMap((g) => g.bullets.map((b) => text(b.parts)));
  assert.ok(t.includes("From 04:14 to 04:20, it bought other tokens through the zap router."));
  assert.ok(!tab(x, "explanation").some((g) => g.id === "more"), "all seven steps");
});

/** A fill with ten steps, one a minute, each on its own arrow; `now` names
 *  mechanism boxes that hold something now, one pETH each. */
function tenSteps(now = []) {
  const amt = (asset) => ({ asset, raw: "1000000000000000000", decimals: 18 });
  const arrows = [
    [PM.outside, MAP_HOLDER],
    [MAP_HOLDER, PM.cdp],
    [PM.cdp, MAP_HOLDER],
    [MAP_HOLDER, PM.sp],
    [PM.sp, MAP_HOLDER],
    [MAP_HOLDER, PM.loan],
    [PM.loan, MAP_HOLDER],
    [MAP_HOLDER, PM.splitter],
    [PM.splitter, MAP_HOLDER],
    [MAP_HOLDER, PM.pools],
  ];
  const t0 = Date.parse("2026-08-18T10:00:00Z") / 1000;
  const edges = {};
  const rows = [];
  arrows.forEach(([a, b], i) => {
    const id = pmEdge(a, b);
    const end = { at: t0 + i * 60, id: `0x${i}` };
    edges[id] = { amounts: [amt("pETH")], rowCount: 1, timelineHref: "", receipt: R(id), first: end, last: end };
    rows.push({ id: end.id, edgeIds: [id], at: end.at });
  });
  return {
    subject: { address: "0x", chain: "sepolia", asOf: { block: null, time: null } },
    nodes: Object.fromEntries(
      now.map((id) => [id, { lines: [{ label: "now", amounts: [amt("pETH")], receipt: R(`${id} now`) }] }]),
    ),
    edges,
    rows,
    counted: { rows: 10, total: 10 },
  };
}

test("past eight bullets: the earliest four, a line to the rest in the timeline, the latest four", () => {
  const x = pethMapExplanation(tenSteps(), XC);
  const g = tab(x, "explanation");
  assert.deepEqual(
    g.map((x) => [x.id, x.heading ?? null, x.bullets.length]),
    [
      ["did", "Its steps", 4],
      ["more", null, 0],
      ["then", null, 4],
    ],
  );
  assertPane(g, "ten steps");
  const more = g[1].lead;
  assert.equal(text(more), "… and 2 more steps in the timeline.");
  const link = more.find((p) => typeof p === "object" && "link" in p);
  assert.equal(link.href, XC.edgesHref([pmEdge(PM.sp, MAP_HOLDER), pmEdge(MAP_HOLDER, PM.loan)]));
  assert.match(text(g[0].bullets[0].parts), /^First, at 18 Aug 2026, 10:00, it received/);
  assert.match(text(g[2].bullets[0].parts), /^Then, at 10:06, it took 1 pETH out of its Floor Loans\./);
  assert.match(text(g[2].bullets[3].parts), /^Most recently, at 10:09, it put/);
});

test("with Now in the pane, the story takes what is left of eight bullets", () => {
  // Three boxes hold something: two Now bullets, the last with one figure,
  // so six story bullets.
  const x = pethMapExplanation(tenSteps([PM.cdp, PM.loan, PM.pools]), XC);
  const g = tab(x, "explanation");
  assert.deepEqual(
    g.map((x) => [x.id, x.bullets.length]),
    [
      ["did", 3],
      ["more", 0],
      ["then", 3],
      ["now", 2],
    ],
  );
  assert.equal(bulletCount(g), 8);
  assertPane(g, "ten steps and Now");
  assert.equal(text(g[1].lead), "… and 4 more steps in the timeline.");
  assert.match(text(g[2].bullets[2].parts), /^Most recently, at 10:09, /);
  assert.deepEqual(
    g[3].bullets.map((b) => text(b.parts)),
    ["Its CDPs held 1 pETH at their last touch, and its Floor Loans hold 1 pETH.", "Its pool shares hold 1 pETH."],
  );
});

// ── Review fixes ──
const fillOf = ({ edges = {}, nodes = {}, rows = [], counted = { rows: rows.length, total: rows.length } }) => ({
  subject: { address: "0x", chain: "sepolia", asOf: { block: null, time: null } },
  nodes,
  edges,
  rows,
  counted,
});
const one = (asset) => ({ asset, raw: "1000000000000000000", decimals: 18 });
const t0 = Date.parse("2026-08-18T10:00:00Z") / 1000;
const on = (from, to, i, amounts = [one("pETH")], later = false) => {
  const end = { at: t0 + i * 60, id: `0x${i}`, ...(later ? { later: true } : {}) };
  return [
    pmEdge(from, to),
    { amounts, rowCount: 1, timelineHref: "", receipt: R(`${from}>${to}`), first: end, last: end },
  ];
};

/** A fill whose arrows touch the given mechanism boxes, one arrow in each. */
const touching = (ids) => fillOf({ edges: Object.fromEntries(ids.map((id, i) => on(MAP_HOLDER, id, i))) });

test("Parts past eight bullets: CDPs, Earn Pools and Floor Loans share one, then the untouched line goes", () => {
  // All nine parts: the zap and the curve through the zap buy, the seven boxes below.
  const nine = touching([PM.cdp, PM.sp, PM.loan, PM.splitter, PM.pools, PM.svpeth, PM.morpho]);
  Object.assign(nine.edges, Object.fromEntries([on(PM.eth, PM.zap, 8, [one("WETH")]), on(PM.zap, PM.curve, 8, [])]));
  const p9 = tab(pethMapExplanation(nine, XC), "parts");
  assertPane(p9, "nine parts");
  const t9 = p9.flatMap((g) => g.bullets.map((b) => text(b.parts)));
  assert.equal(t9.length, 7);
  assert.ok(
    t9.includes(
      `CDPs mint USDp or GOLDp against pETH; ${POLARIS_POOL_NAME} repay liquidated debt; ${POLARIS_LOAN_NAME} lend reserve ETH against fpETH.`,
    ),
  );
  assert.ok(!p9.some((g) => g.id === "unused"));
  assert.equal(p9.flatMap((g) => g.bullets).find((b) => /^CDPs mint/.test(text(b.parts))).learnMore, "market");

  // Eight parts (no Morpho): eight bullets and the untouched line would be nine.
  const eight = touching([PM.cdp, PM.sp, PM.loan, PM.splitter, PM.pools, PM.svpeth]);
  Object.assign(eight.edges, Object.fromEntries([on(PM.eth, PM.zap, 8, [one("WETH")]), on(PM.zap, PM.curve, 8, [])]));
  const p8 = tab(pethMapExplanation(eight, XC), "parts");
  assertPane(p8, "eight parts");
  assert.equal(bulletCount(p8), 7);
  assert.equal(text(p8.find((g) => g.id === "unused").bullets[0].parts), "Not used by this address: Morpho Blue.");
  // Seven parts and the line fit: no sharing.
  const seven = tab(pethMapExplanation(touching([PM.cdp, PM.sp, PM.loan, PM.splitter, PM.pools]), XC), "parts");
  assert.ok(seven.flatMap((g) => g.bullets).some((b) => /^CDPs: lock/.test(text(b.parts))));
});

test("the curve's fee is told once, with the zap buy and both direct curve arrows", () => {
  const f = fillOf({
    edges: Object.fromEntries([
      on(PM.eth, PM.zap, 0, [one("WETH")]),
      on(PM.zap, MAP_HOLDER, 0, [one("pETH")]),
      on(MAP_HOLDER, PM.curve, 1, [one("WETH")]),
      on(PM.curve, MAP_HOLDER, 2, [one("pETH")]),
      on(PM.curve, PM.fee, 0, [one("pETH")]),
    ]),
  });
  const t = tab(pethMapExplanation(f, XC), "explanation").flatMap((g) => g.bullets.map((b) => text(b.parts)));
  assert.equal(t.filter((x) => /fees/.test(x)).length, 1);
  assert.ok(t.includes("The bonding curve charged 1 pETH in fees."));
});

test("a time whose row was read after the first read links to its event page", () => {
  const f = fillOf({
    edges: Object.fromEntries([on(MAP_HOLDER, PM.cdp, 0, undefined, true), on(MAP_HOLDER, PM.loan, 1)]),
  });
  const whens = tab(pethMapExplanation(f, XC), "explanation")
    .flatMap((g) => g.bullets)
    .map((b) => b.parts.find((p) => typeof p === "object" && "when" in p).when.from.href);
  assert.deepEqual(whens, ["/sepolia/polaris/peth/x/event/0x0", "/sepolia/polaris/peth/x?at=0x1"]);
});

test("mergeFillRows marks the rows it adds, and their ends carry it", async () => {
  const { mergeFillRows } = await import("../../lib/shared/protocol-map/types.ts");
  const [id, e] = on(MAP_HOLDER, PM.cdp, 5);
  const m = mergeFillRows(
    fillOf({ edges: { [id]: e }, rows: [{ id: "0x5", edgeIds: [id], at: t0 + 300 }] }),
    [{ id: "0x1", edgeIds: [id], at: t0 + 60 }],
    () => ({ timelineHref: "", receipt: R("new") }),
  );
  assert.deepEqual(m.edges[id].first, { at: t0 + 60, id: "0x1", later: true });
  assert.equal(m.edges[id].last.later, undefined);
  assert.equal(m.rows.find((r) => r.id === "0x1").later, true);
});

test("Now names a line's other assets and keeps one figure a clause", () => {
  const f = fillOf({
    nodes: {
      [PM.pools]: { lines: [{ label: "now", amounts: [one("fpETH"), one("pETH"), one("vpETH")], receipt: R("lp") }] },
      [PM.cdp]: { lines: [{ label: "now", amounts: [one("pETH")], receipt: R("cdp") }] },
    },
  });
  const now = tab(pethMapExplanation(f, XC), "explanation").find((g) => g.id === "now");
  assert.deepEqual(
    now.bullets.map((b) => text(b.parts)),
    ["Its CDPs held 1 pETH at their last touch, and its pool shares hold 1 pETH with fpETH and vpETH."],
  );
  assert.equal(now.bullets[0].parts.filter((p) => typeof p === "object" && "figure" in p).length, 2);
});

test("no group passes four bullets, however the steps' sizes fall", () => {
  // Steps of two bullets (a zap buy and its fee) beside single ones.
  for (let n = 1; n <= 10; n++) {
    const ids = [PM.cdp, PM.sp, PM.loan, PM.splitter, PM.pools, PM.svpeth, PM.morpho].slice(0, Math.min(7, n));
    const f = touching(ids);
    Object.assign(
      f.edges,
      Object.fromEntries([on(PM.eth, PM.zap, 0, [one("WETH")]), on(PM.curve, PM.fee, 0, [one("pETH")])]),
    );
    for (const t of pethMapExplanation(f, XC).tabs) assertPane(t.groups, `${n} ${t.key}`);
  }
});

// ── Ops review fixes ──
const day = (iso) => Date.parse(iso) / 1000;
const span = (edgeId, a, b, amounts, ids = ["0xa", "0xb"]) => [
  edgeId,
  {
    amounts,
    rowCount: 2,
    timelineHref: "",
    receipt: R(edgeId),
    first: { at: day(a), id: ids[0] },
    last: { at: day(b), id: ids[1] },
  },
];
const story = (x) => tab(x, "explanation").flatMap((g) => (g.id === "now" ? [] : g.bullets.map((b) => text(b.parts))));

test('"Most recently" only on a step that ended last', () => {
  // Zap buys from 1 Jan to 20 Nov; one CDP open on 3 Mar sorts after them but ended before.
  const f = fillOf({
    edges: Object.fromEntries([
      span(pmEdge(PM.eth, PM.zap), "2026-01-01T10:00:00Z", "2026-11-20T10:00:00Z", [one("WETH")]),
      span(pmEdge(MAP_HOLDER, PM.cdp), "2026-03-03T10:00:00Z", "2026-03-03T10:00:00Z", [one("pETH")], ["0xc", "0xc"]),
    ]),
  });
  const t = story(pethMapExplanation(f, XC));
  assert.equal(t.length, 2);
  assert.ok(
    t.every((x) => !/Most recently/.test(x)),
    t.join(" | "),
  );
  assert.match(t[1], /^Then, at 3 Mar 2026, 10:00, it put 1 pETH into its CDPs\.$/);
  // Where the last step did end last, it says so.
  const g = fillOf({
    edges: Object.fromEntries([
      span(pmEdge(PM.eth, PM.zap), "2026-01-01T10:00:00Z", "2026-01-02T10:00:00Z", [one("WETH")]),
      span(pmEdge(MAP_HOLDER, PM.cdp), "2026-03-03T10:00:00Z", "2026-03-03T10:00:00Z", [one("pETH")], ["0xc", "0xc"]),
    ]),
  });
  assert.match(story(pethMapExplanation(g, XC))[1], /^Most recently, at 3 Mar 2026, 10:00, /);
});

test("vpETH zap buys are told: alone, and beside pETH zaps", () => {
  const zapHolder = pmEdge(PM.zap, MAP_HOLDER);
  const ethZap = pmEdge(PM.eth, PM.zap);
  // Only ETH → vpETH zaps: the router's arrow back carries vpETH and nothing else.
  const only = fillOf({
    edges: Object.fromEntries([span(zapHolder, "2026-08-18T10:00:00Z", "2026-08-18T10:05:00Z", [one("vpETH")])]),
    rows: [
      { id: "0xa", edgeIds: [zapHolder], at: day("2026-08-18T10:00:00Z") },
      { id: "0xb", edgeIds: [zapHolder], at: day("2026-08-18T10:05:00Z") },
    ],
  });
  assert.deepEqual(story(pethMapExplanation(only, XC)), [
    "From 18 Aug 2026, 10:00 to 10:05, it bought vpETH through the zap router.",
  ]);
  // A pETH zap buy and a later vpETH one.
  const both = fillOf({
    edges: Object.fromEntries([
      span(ethZap, "2026-08-18T10:00:00Z", "2026-08-18T10:00:00Z", [one("WETH")], ["0xa", "0xa"]),
      span(zapHolder, "2026-08-18T10:00:00Z", "2026-08-18T10:05:00Z", [one("pETH"), one("vpETH")]),
    ]),
    rows: [
      { id: "0xa", edgeIds: [ethZap, zapHolder], at: day("2026-08-18T10:00:00Z") },
      { id: "0xb", edgeIds: [zapHolder], at: day("2026-08-18T10:05:00Z") },
    ],
  });
  assert.deepEqual(story(pethMapExplanation(both, XC)), [
    "First, at 18 Aug 2026, 10:00, it paid 1 WETH through the zap router for pETH.",
    "Most recently, at 10:05, it bought vpETH through the zap router.",
  ]);
});

test("the more-steps link names only the skipped steps' own arrows", () => {
  // A zap buy told first; then eight mechanism steps, one of them skipped
  // with the vpETH zap, which reads the zap router's arrow back too.
  const zapHolder = pmEdge(PM.zap, MAP_HOLDER);
  const ethZap = pmEdge(PM.eth, PM.zap);
  const f = tenSteps();
  f.edges[ethZap] = { ...f.edges[pmEdge(PM.outside, MAP_HOLDER)], amounts: [one("WETH")], receipt: R("ethzap") };
  f.edges[zapHolder] = { ...f.edges[ethZap], amounts: [one("pETH"), one("vpETH")], receipt: R("zapholder") };
  delete f.edges[pmEdge(PM.outside, MAP_HOLDER)];
  f.rows = [
    { id: "0x0", edgeIds: [ethZap, zapHolder], at: t0 },
    { id: "0xv", edgeIds: [zapHolder], at: t0 + 330 },
    ...f.rows.slice(1),
  ];
  const g = tab(pethMapExplanation(f, XC), "explanation");
  const more = g.find((x) => x.id === "more");
  const link = more.lead.find((p) => typeof p === "object" && "link" in p);
  // Skipped: the Earn Pool's arrow back, the Floor Loans' arrow in, and the
  // vpETH zap, whose one arrow the told buy also reads, so it keeps that one.
  assert.equal(text(more.lead), "… and 3 more steps in the timeline.");
  assert.deepEqual(link.edges, [pmEdge(PM.sp, MAP_HOLDER), pmEdge(MAP_HOLDER, PM.loan), zapHolder]);
  assert.ok(!link.edges.includes(ethZap));
  assert.equal(link.href, XC.edgesHref(link.edges));
});

test("a time read after the first read is marked for its event page", () => {
  const f = fillOf({
    edges: Object.fromEntries([on(MAP_HOLDER, PM.cdp, 0, undefined, true), on(MAP_HOLDER, PM.loan, 1)]),
  });
  const ends = tab(pethMapExplanation(f, XC), "explanation")
    .flatMap((g) => g.bullets)
    .map((b) => b.parts.find((p) => typeof p === "object" && "when" in p).when.from);
  assert.deepEqual(
    ends.map((e) => [e.id, e.later ?? false]),
    [
      ["0x0", true],
      ["0x1", false],
    ],
  );
});

test("Earn Pool deposits' now is what they held unclaimed at the last touch", () => {
  const f = fillOf({
    nodes: {
      [PM.sp]: {
        lines: [
          { label: "now", amounts: [one("pETH")], receipt: R("spTotal") },
          { label: "note", text: "USDp deposit #3", amounts: [one("pETH")], receipt: R("sp 3") },
          { label: "note", text: "GOLDp deposit #4", amounts: [one("pETH")], receipt: R("sp 4") },
        ],
      },
    },
  });
  const now = tab(pethMapExplanation(f, XC), "explanation").find((g) => g.id === "now");
  assert.deepEqual(
    now.bullets.map((b) => text(b.parts)),
    [`Its ${POLARIS_POOL_NAME.replace(/s$/, "")} deposits held 1 pETH unclaimed at their last touch.`],
  );
});

// ── Re-review fixes ──
test('"Most recently" goes to no told step when a skipped one ended last', () => {
  // Ten steps one a minute; the fourth from the start of the skipped middle
  // (Earn Pool → this address, step 5) ran on to the day's end.
  const f = tenSteps();
  const late = pmEdge(PM.sp, MAP_HOLDER);
  f.edges[late] = { ...f.edges[late], last: { at: t0 + 86000, id: "0xlate" } };
  const g = tab(pethMapExplanation(f, XC), "explanation");
  assert.ok(g.some((x) => x.id === "more"));
  const t = g.flatMap((x) => x.bullets.map((b) => text(b.parts)));
  assert.ok(
    t.every((x) => !/Most recently/.test(x)),
    t.join(" | "),
  );
});

test("the other tokens' step reads the router's arrow back where vpETH came in, and the link de-dups it", () => {
  const zapHolder = pmEdge(PM.zap, MAP_HOLDER);
  const ethZap = pmEdge(PM.eth, PM.zap);
  const zapOther = pmEdge(PM.zap, PM.other);
  const f = tenSteps();
  f.edges[ethZap] = { ...f.edges[pmEdge(PM.outside, MAP_HOLDER)], amounts: [one("WETH")], receipt: R("ethzap") };
  f.edges[zapHolder] = { ...f.edges[ethZap], amounts: [one("pETH"), one("vpETH")], receipt: R("zapholder") };
  f.edges[zapOther] = { ...f.edges[ethZap], amounts: [one("USDp")], receipt: R("zapother") };
  delete f.edges[pmEdge(PM.outside, MAP_HOLDER)];
  f.rows = [
    { id: "0x0", edgeIds: [ethZap, zapHolder], at: t0 },
    { id: "0xu", edgeIds: [zapOther], at: t0 + 330 },
    { id: "0xv", edgeIds: [zapHolder], at: t0 + 335 },
    ...f.rows.slice(1),
  ];
  const g = tab(pethMapExplanation(f, XC), "explanation");
  const link = g.find((x) => x.id === "more").lead.find((p) => typeof p === "object" && "link" in p);
  // The other tokens' step is skipped: its own arrow is the one to the other
  // tokens; the router's arrow back is the told buy's too, so it is left out.
  assert.ok(link.edges.includes(zapOther), link.edges.join(","));
  assert.ok(!link.edges.includes(zapHolder) && !link.edges.includes(ethZap), link.edges.join(","));
});

test("the in-place helpers: the filter's arrows, the landing's clear, the plain click", () => {
  const { mapEdgesIn, mapLandingClearsFilter, mapPlainClick, mergeFillRows } = TYPES;
  // An arrow only older rows use joins the merged fill, and the filter takes it.
  const base = fillOf({ edges: Object.fromEntries([on(MAP_HOLDER, PM.cdp, 0)]) });
  const older = pmEdge(MAP_HOLDER, PM.loan);
  assert.deepEqual(mapEdgesIn([older, pmEdge(MAP_HOLDER, PM.cdp)], base), [pmEdge(MAP_HOLDER, PM.cdp)]);
  const merged = mergeFillRows(base, [{ id: "0xo", edgeIds: [older], at: t0 - 60 }], () => ({
    timelineHref: "",
    receipt: R("new"),
  }));
  assert.deepEqual(mapEdgesIn([older, "nope", older], merged), [older]);
  // Landing clears the filter only where the filter hides the event.
  assert.equal(mapLandingClearsFilter("0x1", new Set(["0x1"])), true);
  assert.equal(mapLandingClearsFilter("0x2", new Set(["0x1"])), false);
  assert.equal(mapLandingClearsFilter("0x1", null), false);
  // A plain left click is handled in place; a modifier or another button is not.
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  assert.equal(mapPlainClick(click), true);
  for (const k of ["metaKey", "ctrlKey", "shiftKey", "altKey"])
    assert.equal(mapPlainClick({ ...click, [k]: true }), false, k);
  assert.equal(mapPlainClick({ ...click, button: 1 }), false);
  assert.equal(mapPlainClick({ ...click, button: 2 }), false);
});

test("a skipped vpETH zap with no ETH zap links the router's arrow back", () => {
  // No ETH → zap arrow: the router's arrow back is the other tokens' step's
  // alone, so the link to the skipped step carries it with the other tokens' arrow.
  const zapHolder = pmEdge(PM.zap, MAP_HOLDER);
  const zapOther = pmEdge(PM.zap, PM.other);
  const f = tenSteps();
  f.edges[zapHolder] = { ...f.edges[pmEdge(PM.outside, MAP_HOLDER)], amounts: [one("vpETH")], receipt: R("zh") };
  f.edges[zapOther] = { ...f.edges[zapHolder], amounts: [one("USDp")], receipt: R("zo") };
  f.edges[zapHolder].first = f.edges[zapOther].first = { at: t0 + 330, id: "0xu" };
  f.edges[zapHolder].last = f.edges[zapOther].last = { at: t0 + 335, id: "0xv" };
  f.rows = [
    ...f.rows,
    { id: "0xu", edgeIds: [zapOther], at: t0 + 330 },
    { id: "0xv", edgeIds: [zapHolder], at: t0 + 335 },
  ];
  const g = tab(pethMapExplanation(f, XC), "explanation");
  const link = g.find((x) => x.id === "more").lead.find((p) => typeof p === "object" && "link" in p);
  assert.ok(
    !g.flatMap((x) => x.bullets.map((b) => text(b.parts))).some((t) => /bought/.test(t)),
    "the other tokens' step is skipped",
  );
  assert.ok(link.edges.includes(zapOther), link.edges.join(","));
  assert.ok(link.edges.includes(zapHolder), link.edges.join(","));
});
