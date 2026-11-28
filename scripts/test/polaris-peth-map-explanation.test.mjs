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
const { POLARIS_MAP_LAYOUT, POLARIS_POOL_NAME, PM, pmEdge } = await import("../../lib/polaris/peth-map-layout.ts");
const { MAP_HOLDER, mapExact, mapPartText, mapSeries, mapUnusedWords, usedNodes } = await import(
  "../../lib/shared/protocol-map/types.ts"
);

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
  eventHref: (id) => `/sepolia/polaris/peth/x?at=${id}`,
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

for (const [name, fill] of CASES) {
  const x = pethMapExplanation(fill, XC);

  test(`${name}: every bullet keeps Z1's limits`, () => {
    for (const g of x.groups) {
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
    for (const g of x.groups)
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
    for (const g of x.groups)
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
            const skipped = s.match(/^(\d+) more steps$/);
            assert.ok(!/\d/.test(skipped ? "" : s), `a number in words: ${s}`);
          }
        }
  });

  test(`${name}: the untouched line names the dashed boxes`, () => {
    const line = x.groups.find((g) => g.id === "unused");
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
    const ids = x.groups.map((g) => g.id);
    if (fill.edgesUnknown) {
      // Only what sits where now, and the parts that hold it.
      assert.deepEqual(
        ids.filter((id) => !id.startsWith("now") && !id.startsWith("parts")),
        [],
      );
      assert.ok(ids.includes("now"));
      for (const g of x.groups) for (const b of g.bullets) assert.ok(!b.parts.some((p) => p.when), "no time");
      return;
    }
    assert.equal(ids[0], "did");
    assert.ok(ids.includes("now") && ids.includes("parts") && ids.includes("unused"));
    const did = x.groups[0];
    if (fill.counted.rows < fill.counted.total) {
      assert.equal(text(did.lead), `These steps cover the newest ${fill.counted.rows} transactions.`);
      // The arrows carry no amounts past the first read, so the story states none.
      for (const g of x.groups.filter((g) => g.id === "did" || g.id === "then"))
        for (const b of g.bullets) assert.ok(!b.parts.some((p) => p.figure), text(b.parts));
    } else assert.equal(did.lead, undefined);
  });
}

test("0x38d7: the drawer's words", () => {
  const x = pethMapExplanation(full("map-38d7"), XC);
  const out = x.groups.map((g) => [g.heading ?? null, g.bullets.map((b) => text(b.parts))]);
  assert.deepEqual(out, [
    [
      "What this address did",
      [
        "First, from 18 Aug 2026, 11:26 to 11:28, it paid 30 WETH through the zap router for pETH and fpETH.",
        "The bonding curve took 0.173605765590902838 pETH of it in fees.",
      ],
    ],
    [
      "Then",
      [
        "Then, from 11:28 to 11:29, it put 11 pETH into USDp CDP #36 and GOLDp CDP #22.",
        "Most recently, at 11:30, it put 5 fpETH into reserve loan #28 as collateral.",
      ],
    ],
    [
      "Now",
      [
        "Its CDPs held 10.925 pETH at their last touch, and loan #28 holds 5 fpETH.",
        "It now holds 0.457336014283415572 pETH and 3.778050067873262182 fpETH.",
      ],
    ],
    [
      "What each part does",
      [
        "Zap router: trades ETH for Polaris tokens in one transaction.",
        "Bonding curve: mints pETH against ETH and burns pETH to release ETH; its fees go to the fee router.",
        "CDPs: lock pETH as collateral to mint USDp or GOLDp.",
        "Reserve loans: lend the reserve's ETH against fpETH collateral.",
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
  const first = x.groups[0].bullets[0].parts.find((p) => p.when).when;
  const f = full("map-38d7").edges[pmEdge(PM.eth, PM.zap)];
  assert.equal(first.from.href, XC.eventHref(f.first.id));
  assert.equal(first.to.href, XC.eventHref(f.last.id));
  // The CDPs' "?" opens Polaris's market modal.
  assert.equal(x.groups[3].bullets[2].learnMore, "market");
});

test("0xc513: the story's order, the other tokens' bullet and its span", () => {
  const x = pethMapExplanation(full("map-c513"), XC);
  const did = x.groups[0].bullets.map((b) => text(b.parts));
  const then = x.groups[1].bullets.map((b) => text(b.parts));
  assert.equal(did.length, 4);
  assert.match(did[0], /^First, from 18 Aug 2026, 04:09 to 04:18, it paid 60 WETH through the zap router/);
  assert.match(did[1], /^The bonding curve took 0\.3637\d+ pETH of it in fees\.$/);
  assert.match(did[2], /^At 04:10, it received 20\.75\d+ pETH from other addresses\.$/);
  assert.equal(
    did[3],
    "From 04:14 to 04:20, it bought vpETH, USDp, GOLDp and POLAR through the zap router; these are not counted in ETH here.",
  );
  assert.deepEqual(then, [
    "Then, at 04:21, it staked 20 vpETH in the svpETH vault.",
    "From 04:30 to 04:33, it put 9.569186061655532494 pETH along with fpETH and vpETH into the pools.",
    "Most recently, at 04:34, it traded 2.107623962359256268 fpETH through the zap router.",
  ]);
  assert.equal(
    text(x.groups.find((g) => g.id === "unused").bullets[0].parts),
    `Not used by this address: CDPs, the ${POLARIS_POOL_NAME}, reserve loans, the Splitter and Morpho Blue.`,
  );
});

test("past eight bullets: the earliest four, a line to the rest in the timeline, the latest four", () => {
  // A fill with ten steps, one a minute, each on its own arrow.
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
  const fill = {
    subject: { address: "0x", chain: "sepolia", asOf: { block: null, time: null } },
    nodes: {},
    edges,
    rows,
    counted: { rows: 10, total: 10 },
  };
  const x = pethMapExplanation(fill, XC);
  assert.deepEqual(
    x.groups.slice(0, 3).map((g) => [g.id, g.bullets.length]),
    [
      ["did", 4],
      ["more", 0],
      ["then", 4],
    ],
  );
  const more = x.groups[1].lead;
  assert.equal(text(more), "… and 2 more steps, in the timeline.");
  const link = more.find((p) => typeof p === "object" && "link" in p);
  assert.equal(link.href, XC.edgesHref([pmEdge(PM.sp, MAP_HOLDER), pmEdge(MAP_HOLDER, PM.loan)]));
  assert.match(text(x.groups[0].bullets[0].parts), /^First, at 18 Aug 2026, 10:00, it received/);
  assert.match(text(x.groups[2].bullets[0].parts), /^Then, at 10:06, it took 1 pETH out of its reserve loans\./);
  assert.match(text(x.groups[2].bullets[3].parts), /^Most recently, at 10:09, it put/);
});
