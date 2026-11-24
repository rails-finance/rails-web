// A protocol's asset page in words (lib/shared/asset-oracle-view.ts; Miles's
// mockup of 24 Nov 2026, ui-jobs 818) and the price-now answer it reads
// (lib/shared/asset-prices-now.ts): the title and source line, "Also reads
// this oracle", the oracle table, the as-of line, and the stub's shaping of
// the stored prices. Fixtures from the roster's WETH and USDC on Ethereum
// (GET /api/prices/assets, 24 Nov 2026). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// The modules import their siblings by extensionless specifier, as the app does.
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

const view = await import("../../lib/shared/asset-oracle-view.ts");
const { storedPricesNow, unreadPricesNow } = await import("../../lib/shared/asset-prices-now.ts");
const { assetPage } = await import("../../lib/shared/asset-roster.ts");
const { viaPage } = await import("../../lib/shared/asset-via.ts");

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const s = (key, protocol, firstDay, extra = {}) => ({ key, protocol, firstDay, lastDay: null, ...extra });
const rl = (address, name, kind, series, extra = {}) => ({
  oracle: { address, name, kind, ...extra },
  protocols: [...new Set(series.map((x) => x.protocol))],
  series,
});
const LIQUITY_LINE = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";
const OSM = "0x81fe72b5a8d1a857d176c3e7d5bd2679a9b85763";
const roster = {
  readAt: {},
  native: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  related: [],
  assets: [
    {
      chain: 1,
      token: WETH,
      symbol: "WETH",
      underlying: null,
      wrapped: [],
      lines: [
        rl("0x5424384b256154046e9667ddfaaa5e550145215e", "Chainlink ETH / USD", "chainlink", [
          s(`aave-v3:core:${WETH}`, "Aave V3 Core", 19384),
          s(`aave-v3:prime:${WETH}`, "Aave V3 Prime", 19933),
          s(`aave-v4:${WETH}`, "Aave V4", 20535),
        ]),
        rl(LIQUITY_LINE, "Chainlink ETH / USD", "chainlink", [
          s("liquity-v2:WETH", "Liquity V2", 20227, {
            via: {
              address: "0xcc5f8102eb670c89a4a3c567c13851260303c24f",
              name: "Liquity V2 WETH PriceFeed",
              kind: "pass",
            },
          }),
          s("moonwell:0xb85ca1decc4971f8094da7676f8b71002a9590c4", "Moonwell", 20604, {
            via: {
              address: "0xa0f82711a8b228455a2dfe0656763a60833b5e25",
              name: "Moonwell's OEV wrapper",
              kind: "pass",
            },
          }),
        ]),
        rl(
          OSM,
          "Maker OSM over the Chronicle ETH/USD median",
          "osm",
          [
            s("maker:ETH-A", "Maker ETH-A", 18213),
            s("maker:ETH-B", "Maker ETH-B", 18554),
            s("maker:ETH-C", "Maker ETH-C", 18705),
          ],
          {
            reads: "0x46ef0071b1e2ff6b42d36e5a177ea43ae5917f4e",
            label: { short: "Chronicle median", kind: "1 h delayed" },
            hop: 3600,
          },
        ),
        rl("0xc0053f3fbccd593758258334dfce24c2a9a673ad", "Chainlink ETH / USD", "chainlink", [
          s(`cv3:0xc3d688b66703497daa19211eedff47f25384cdc3:${WETH}`, "Compound V3 cUSDCv3", 19230),
          s(`cv3:0xa17581a9e3356d9a858b789d68b4d866e593ae94:${WETH}`, "Compound V3 cWETHv3", 19381, {
            via: { address: "0xd72ac1bce9177cfe7aeb5d0516a38c88a64ce0ab", name: "a constant 1 ETH feed", kind: "pass" },
          }),
        ]),
        rl(
          "0x2750e4cb635af1fccfb10c0ea54b5b5bfc2759b6",
          "Aggregated price feed ETH/USD from Chronicle, Chainlink, and RedStone oracles",
          "adapter",
          [s(`spark:${WETH}`, "SparkLend", 19445)],
          { label: { short: "Chronicle + Chainlink + RedStone", kind: "aggregated" } },
        ),
        rl(
          "0xa150ef2d5827db283321d15d62d5d07fb41d636e",
          "Dolomite oracle aggregator",
          "protocol",
          [s("dolomite:0", "Dolomite", 20265)],
          { label: { short: "Dolomite aggregator", kind: "aggregated" } },
        ),
      ],
    },
  ],
};
const page = assetPage(roster, 1);
const HREFS = {
  "aave-v3": "/ethereum/aave-v3",
  "aave-v4": "/ethereum/aave-v4",
  liquity: "/ethereum/liquity-v2",
  makerdao: "/ethereum/makerdao",
  moonwell: "/ethereum/moonwell",
};
const pageOf = (id) => (HREFS[id] ? `${HREFS[id]}/assets/${WETH}` : null);
const from = (id, label) => {
  const { page: p, view: v } = viaPage(page, { id, label, chain: 1 });
  const section = p.chains[0];
  return { section, view: v, line: section.lines.find((l) => l.id === v.lineId) ?? section.lines[0] };
};
const liquity = from("liquity", "Liquity V2");
const maker = from("makerdao", "MakerDAO");
const morpho = from("morpho", "Morpho Blue");
const NOW = Date.UTC(2026, 10, 24, 9, 0);
const TS = Date.UTC(2026, 10, 24, 7, 12) / 1000;

/** A same-block answer: every line at block 26,483,745. */
function sameBlock(prices) {
  const out = {};
  for (const [id, price] of Object.entries(prices))
    out[id] =
      price == null
        ? {
            ok: false,
            price: null,
            reason: "The feed reverted",
            block: 26483745,
            timestamp: TS,
            read: "latestRoundData()",
          }
        : { ok: true, price, block: 26483745, timestamp: TS, read: "latestRoundData()" };
  return { chain: 1, block: 26483745, timestamp: TS, sameBlock: true, prices: out };
}
const ids = Object.fromEntries(page.chains[0].lines.map((l) => [l.oracle.address.slice(0, 6), l.id]));

test("the source names the oracle and the contract it is read through", () => {
  assert.equal(liquity.view.lineId, `1:${LIQUITY_LINE}`);
  assert.deepEqual(view.sourceLine(liquity.line, "liquity"), {
    words: "Chainlink ETH / USD, read through Liquity V2's WETH PriceFeed",
    address: "0xcc5f8102eb670c89a4a3c567c13851260303c24f",
  });
  // Maker: the OSM's served short name and hop.
  assert.equal(maker.line.oracle.address, OSM);
  assert.deepEqual(view.sourceLine(maker.line, "makerdao"), {
    words: "Chronicle median, held 1 hour by Maker's OSM",
    address: OSM,
  });
  // Aave V3 reads the feed direct: its name and address.
  const aave = from("aave-v3", "Aave V3");
  assert.deepEqual(view.sourceLine(aave.line, "aave-v3"), {
    words: "Chainlink ETH / USD",
    address: "0x5424384b256154046e9667ddfaaa5e550145215e",
  });
  // Morpho stores no line: the most read, said so.
  assert.equal(morpho.view.lineId, null);
  assert.deepEqual(view.sourceLine(morpho.line, null, { protocol: "Morpho Blue", symbol: "WETH" }), {
    words: "Morpho Blue has no stored price for WETH here; the price most protocols read is Chainlink ETH / USD",
    address: "0x5424384b256154046e9667ddfaaa5e550145215e",
  });
  assert.equal(view.delayWords(7200), "2 hours");
  assert.equal(view.delayWords(5400), "90 minutes");
});

test("same-oracle readers: the other protocols on the line, route and first day", () => {
  const list = view.alsoReads(liquity.line, "liquity", pageOf);
  assert.equal(list.length, 1);
  assert.equal(list[0].protocol.name, "Moonwell");
  assert.equal(list[0].protocol.href, `/ethereum/moonwell/assets/${WETH}`);
  assert.equal(list[0].route.words, "its OEV wrapper");
  assert.equal(list[0].since, 20604, "its first stored day, 31 May 2026");
  assert.equal(list[0].route.address, "0xa0f82711a8b228455a2dfe0656763a60833b5e25");
  // Morpho's page: every reader of the most-read line, a protocol's markets together.
  const most = view.alsoReads(morpho.line, "morpho", pageOf);
  assert.deepEqual(
    most.map((e) => [e.protocol.name, e.since]),
    [
      ["Aave V3", 19384],
      ["Aave V4", 20535],
    ],
  );
  assert.equal(most[0].route, null);
  // Maker's page: no other protocol reads the OSM.
  assert.deepEqual(view.alsoReads(maker.line, "makerdao", pageOf), []);
});

test("the table: a row per other line, grouped, short names from stored data, no deployer", () => {
  const now = sameBlock({
    [ids["0x5424"]]: 1697.1,
    [ids["0x5f4e"]]: 1697.0,
    [ids["0x81fe"]]: 1702.4,
    [ids["0xc005"]]: 1696.85,
    [ids["0x2750"]]: 1697.05,
    [ids["0xa150"]]: null,
  });
  const rows = view.oracleRows(liquity.section.lines, liquity.line, now, pageOf);
  assert.ok(!rows.some((r) => r.lineId === liquity.line.id), "the page's line is not a row");
  // One row per protocol: Aave V3 and Aave V4 share an oracle and a contract, in two rows.
  assert.deepEqual(
    rows.map((r) => r.protocol.name),
    ["Aave V3", "Aave V4", "Maker", "Compound V3", "SparkLend", "Dolomite"],
  );
  const [aave, aave4] = rows;
  assert.deepEqual(
    [aave, aave4].map((r) => [r.protocol.name, r.protocol.href, r.address]),
    [
      ["Aave V3", `/ethereum/aave-v3/assets/${WETH}`, "0x5424384b256154046e9667ddfaaa5e550145215e"],
      ["Aave V4", `/ethereum/aave-v4/assets/${WETH}`, "0x5424384b256154046e9667ddfaaa5e550145215e"],
    ],
  );
  assert.deepEqual([aave.price.text, aave.gap.text], [aave4.price.text, aave4.gap.text]);
  // No short name stored: the full name, and no subtitle (no "Aave's feed").
  assert.equal(aave.name, "Chainlink ETH / USD");
  assert.equal(aave.full, null);
  assert.equal(aave.kind, null);
  const osm = rows.find((r) => r.address === OSM);
  assert.deepEqual(
    [osm.name, osm.kind, osm.full],
    ["Chronicle median", "1 h delayed", "Maker OSM over the Chronicle ETH/USD median"],
  );
  assert.equal(osm.protocol.name, "Maker", "three ilks, one protocol, one row");
  const spark = rows.find((r) => r.address.startsWith("0x2750"));
  assert.deepEqual([spark.name, spark.kind], ["Chronicle + Chainlink + RedStone", "Aggregated"]);
  const comet = rows.find((r) => r.address.startsWith("0xc005"));
  // Gaps against Liquity V2's 1,697.00, signed and rounded to two decimals.
  assert.deepEqual([aave.price.text, aave.gap.text], ["$1,697.10", "+0.01%"]);
  assert.deepEqual([osm.price.text, osm.gap.text], ["$1,702.40", "+0.32%"]);
  assert.deepEqual([comet.price.text, comet.gap.text], ["$1,696.85", "−0.01%"]);
  assert.equal(spark.gap.text, "0.00%");
  // A failed read: "–" with its reason, in the price and the gap.
  const dolo = rows.find((r) => r.address.startsWith("0xa150"));
  assert.deepEqual([dolo.price.text, dolo.price.reason], ["–", "The feed reverted"]);
  assert.deepEqual([dolo.gap.text, dolo.gap.reason], ["–", "The feed reverted"]);
  // The page's price unread: every gap is "–" with that reason.
  const noRef = { ...now, prices: { ...now.prices, [liquity.line.id]: { ...now.prices[ids["0xa150"]] } } };
  const r2 = view.oracleRows(liquity.section.lines, liquity.line, noRef, pageOf);
  assert.ok(r2.every((r) => r.gap.text === "–" && r.gap.reason === "The feed reverted"));
  assert.equal(rows.find((r) => r.protocol.name === "Aave V4").protocol.href, `/ethereum/aave-v4/assets/${WETH}`);
  assert.equal(view.asOfText(now), "As of 24 Nov 2026, 07:12 UTC · block 26,483,745");
  assert.ok(rows.every((r) => r.group === "other"));
});

test("a protocol on more than one line is named by market", () => {
  const usdc = (address, name, series, label) => ({
    id: `1:${address}`,
    oracle: { address, name, kind: "adapter", ...(label ? { label } : {}) },
    protocols: [],
    readers: 0,
    span: 0,
    drawn: series[0],
    series: series.map((x) => ({ ...x, token: { chain: 1, token: "0xa0b8", symbol: "USDC" } })),
  });
  const core = usdc(
    "0x3f73",
    "Price cap over Chainlink USDC / USD",
    [s("aave-v3:core:0xa0b8", "Aave V3 Core", 19384)],
    {
      short: "Chainlink USDC / USD",
      kind: "capped",
    },
  );
  const etherfi = usdc("0xb655", "Price cap over Chainlink USDC / USD", [
    s("aave-v3:etherfi:0xa0b8", "Aave V3 EtherFi", 19975),
  ]);
  const gone = usdc("0x77b6", "Maker fixed at 1.00 (a DSValue)", [
    s("maker:USDC-A", "Maker USDC-A", 18338, { retired: true }),
  ]);
  const now = unreadPricesNow(1, [core, etherfi, gone], "The prices were not read");
  const rows = view.oracleRows([core, etherfi, gone], core, now, () => null);
  assert.equal(rows[0].protocol.name, "Aave V3 EtherFi");
  assert.equal(rows[0].name, "Price cap over Chainlink USDC / USD", "no label: the full name");
  assert.deepEqual([rows[1].retired, rows[1].protocol.name], [true, "Maker"]);
  assert.deepEqual([rows[0].price.text, rows[0].price.reason, rows[0].gap], ["–", "The prices were not read", null]);
});

test("prices at different blocks: the price only, no gap, no stamp, no as-of line", () => {
  const roundsAnswer = {
    lane: "on",
    asOf: { block: 23860201, ts: TS },
    lines: {
      [LIQUITY_LINE]: { unit: "usd", scale: 8, points: [[TS - 3600, "169700000000", 23859900]] },
      "0x5424384b256154046e9667ddfaaa5e550145215e": { unsettled: "not yet" },
    },
  };
  const daily = {
    series: {
      "maker:ETH-A": {
        unit: "usd",
        scale: 18,
        obs: [
          [20780, "1702400000000000000000", "23855000"],
          [20779, "1690000000000000000000", "23848000"],
        ],
      },
    },
  };
  const now = storedPricesNow(1, liquity.section.lines, roundsAnswer, daily);
  assert.equal(now.sameBlock, false);
  assert.equal(now.stub, true);
  const lq = now.prices[liquity.line.id];
  assert.deepEqual([lq.ok, lq.price, lq.block, lq.timestamp, lq.read], [true, 1697, 23860201, TS, "round"]);
  const mk = now.prices[`1:${OSM}`];
  assert.deepEqual([mk.price, mk.block, mk.read], [1702.4, 23855000, "day"]);
  assert.equal(mk.timestamp, 20781 * 86400 - 1, "a daily read stands at its day's close");
  // A line with no rounds and no recent day in the store: no price, with why.
  assert.deepEqual(
    [now.prices[ids["0x5424"]].ok, now.prices[ids["0x5424"]].reason],
    [false, "Rails stores no price for this oracle in the last 10 days"],
  );
  assert.equal(now.block, 23860201, "the latest of the lines' blocks");
  const rows = view.oracleRows(liquity.section.lines, liquity.line, now, pageOf);
  assert.ok(
    rows.every((r) => r.gap === null),
    "no gap column",
  );
  const osm = rows.find((r) => r.address === OSM);
  assert.equal(osm.price.text, "$1,702.40");
  assert.ok(
    rows.every((r) => !("stamp" in r.price)),
    "no per-row stamp",
  );
  assert.equal(view.priceTime(lq, NOW + 86_400_000), "24 Nov 2026, 07:12 UTC");
  assert.equal(view.headTime(lq, NOW), "updated 07:12 UTC");
  assert.equal(view.headTime(mk, NOW), "close of 23 Nov 2026");
  assert.equal(view.headTime(now.prices[ids["0x5424"]], NOW), null);
  assert.equal(view.asOfText(now), null, "no footer in stub mode");
  assert.ok(
    view
      .sameRows(liquity.line, view.alsoReads(liquity.line, "liquity", pageOf), "Liquity V2", now)
      .every((r) => r.gap === null),
  );
  // A checkpoint with no time: the round's block and time, so a block always carries its time.
  const untimed = storedPricesNow(1, [liquity.line], { ...roundsAnswer, asOf: { block: 23860201, ts: null } }, null);
  assert.deepEqual(
    [untimed.prices[liquity.line.id].block, untimed.prices[liquity.line.id].timestamp],
    [23859900, TS - 3600],
  );
  // Neither store read: every line unread.
  const none = storedPricesNow(1, liquity.section.lines, null, null);
  assert.ok(Object.values(none.prices).every((p) => !p.ok && p.reason === "The stored prices were not read"));
});

test("the figures' formats", () => {
  assert.equal(view.fmtPriceNow(1697.1), "$1,697.10");
  assert.equal(view.fmtPriceNow(0.99987), "$0.9999");
  assert.equal(view.fmtGap(0.004), "0.00%");
  assert.equal(view.fmtGap(-0.004), "0.00%");
  assert.equal(view.fmtGap(0.3157), "+0.32%");
  assert.equal(view.fmtGap(-1.5), "−1.50%");
});

test("receipts name the oracle, what was read and the block", () => {
  const p = { ok: true, price: 1697.1, block: 26483745, timestamp: TS, read: "latestRoundData()" };
  const r = view.priceProv(liquity.line, p, "WETH");
  assert.equal(r.contract.address, LIQUITY_LINE);
  assert.equal(r.via, "latestRoundData()");
  assert.deepEqual(r.source, { block: 26483745 });
  assert.match(
    r.summary,
    /^WETH price from Chainlink ETH \/ USD — latestRoundData\(\) on Chainlink ETH \/ USD at block 26,483,745/,
  );
  const g = view.gapProv({ name: "Chronicle median" }, 1702.4, 1697, "Liquity V2's price", 26483745);
  assert.equal(g.inputs.length, 2);
  assert.match(g.summary, /^Gap from Liquity V2's price — /);
});

// ── Also listed by (A2.7) ──────────────────────────────────────────────────

const chip = (explorer, label, extra = {}) => ({ explorer, label, chain: 1, ...extra });
const listedChips = [
  chip("liquity", "Liquity V2"),
  chip("moonwell", "Moonwell"),
  chip("makerdao", "MakerDAO"),
  chip("morpho", "Morpho Blue"),
  chip("pendle", "Pendle"),
  chip("sbold", "sBOLD", { token: { symbol: "BOLD", address: "0x1" } }),
  chip("morpho-base", "Morpho Blue", { chain: 8453 }),
];
const listedNamed = () => {
  const pageLine = liquity.line;
  const reads = view.alsoReads(pageLine, "liquity", pageOf);
  const rows = view.oracleRows(liquity.section.lines, pageLine, sameBlock({}), pageOf);
  return { reads, rows };
};

test("also listed: leaves out the page's protocol, the readers and the table's Used by", () => {
  const out = view.alsoListed(listedChips, 1, "liquity", listedNamed(), pageOf);
  assert.deepEqual(
    out.map((e) => e.explorer),
    ["morpho", "pendle"],
  );
});

test("also listed: a name links to its page for the token, plain where it has none", () => {
  const out = view.alsoListed(listedChips, 1, "liquity", listedNamed(), (id) =>
    id === "morpho" ? pageOf("moonwell") : null,
  );
  assert.equal(out[0].href, `/ethereum/moonwell/assets/${WETH}`);
  assert.equal(out[1].href, null);
});

test("also listed: a reason clause only where the data states one", () => {
  const none = view.alsoListed(listedChips, 1, "liquity", listedNamed(), pageOf);
  assert.ok(none.every((e) => e.reason === null));
  const given = view.alsoListed(listedChips.slice(3, 4), 1, "liquity", listedNamed(), pageOf, (id) =>
    id === "morpho" ? "which prices WETH per market" : null,
  );
  assert.equal(given[0].reason, "which prices WETH per market");
});

test("also listed: nobody to list is no entry and no words", () => {
  const out = view.alsoListed(listedChips.slice(0, 3), 1, "liquity", listedNamed(), pageOf);
  assert.deepEqual(out, []);
});

// ── One table: the three groups ───────────────────────────────────────────

const tableFor = (v, id, now, pageName, chips = listedChips) => {
  const reads = view.alsoReads(v.line, id, pageOf);
  const other = view.oracleRows(v.section.lines, v.line, now, pageOf);
  const listed = view.alsoListed(chips, 1, id, { reads, rows: other }, pageOf);
  return view.tableRows(view.sameRows(v.line, reads, pageName, now), other, view.listedRows(listed, now));
};
const liquityNow = () =>
  sameBlock({
    [ids["0x5424"]]: 1697.1,
    [ids["0x5f4e"]]: 1697.0,
    [ids["0x81fe"]]: 1702.4,
    [ids["0xc005"]]: 1696.85,
    [ids["0x2750"]]: 1697.05,
    [ids["0xa150"]]: null,
  });

test("the table: same-oracle readers, then the other lines, then the listed-only protocols", () => {
  const rows = tableFor(liquity, "liquity", liquityNow(), "Liquity V2");
  const groups = rows.map((r) => r.group);
  assert.deepEqual(groups, ["same", "other", "other", "other", "other", "other", "other", "listed", "listed"]);
  assert.deepEqual([...new Set(groups)], ["same", "other", "listed"], "each group is one run, in this order");
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, "a row id is unique");
});

test("a same-oracle row: the page protocol's name, its route, the page line's price", () => {
  const now = liquityNow();
  const [row] = tableFor(liquity, "liquity", now, "Liquity V2");
  assert.equal(row.protocol.name, "Moonwell");
  assert.equal(row.protocol.href, `/ethereum/moonwell/assets/${WETH}`);
  assert.equal(row.name, "Same oracle as Liquity V2");
  assert.deepEqual(row.via, { words: "its OEV wrapper", address: "0xa0f82711a8b228455a2dfe0656763a60833b5e25" });
  assert.equal(row.address, liquity.line.oracle.address);
  assert.equal(row.price.text, "$1,697.00");
  assert.equal(row.gap.text, "0.00%");
  assert.equal(row.lineId, liquity.line.id);
});

test('Morpho\'s page has no line of its own: its readers read "The price charted above"', () => {
  const rows = tableFor(morpho, "morpho", sameBlock({}), null, []);
  const same = rows.filter((r) => r.group === "same");
  assert.deepEqual(
    same.map((r) => [r.protocol.name, r.name]),
    [
      ["Aave V3", "The price charted above"],
      ["Aave V4", "The price charted above"],
    ],
  );
  assert.equal(same[0].via, null);
});

test("a listed-only row: not saved by Rails, no price", () => {
  const rows = tableFor(liquity, "liquity", liquityNow(), "Liquity V2");
  const listed = rows.filter((r) => r.group === "listed");
  assert.deepEqual(
    listed.map((r) => [r.protocol.name, r.name, r.address, r.price.text, r.gap.text]),
    [
      ["Morpho Blue", "Not saved by Rails", null, "–", "–"],
      ["Pendle", "Not saved by Rails", null, "–", "–"],
    ],
  );
  assert.equal(listed[0].protocol.href, null, "pageOf names no page for Morpho Blue here");
});

test("stub mode: the same-oracle and listed rows show the price only", () => {
  const stub = { ...liquityNow(), sameBlock: false, block: null, timestamp: null };
  const rows = tableFor(liquity, "liquity", stub, "Liquity V2");
  assert.ok(
    rows.every((r) => r.gap === null),
    "no Gap column",
  );
  assert.equal(rows[0].price.text, "$1,697.00");
  assert.ok(rows.every((r) => !("stamp" in r.price)));
  assert.equal(view.asOfText(stub), null);
});

// ── One row per protocol, linked, with its own label ───────────────────────

test("the Aave split: V3 and V4 are two rows with the same oracle and contract, each linked to its page", () => {
  const rows = tableFor(morpho, "morpho", sameBlock({}), null, []);
  const same = rows.filter((r) => r.group === "same");
  assert.deepEqual(
    same.map((r) => [r.protocol.name, r.protocol.href, r.address]),
    [
      ["Aave V3", `/ethereum/aave-v3/assets/${WETH}`, "0x5424384b256154046e9667ddfaaa5e550145215e"],
      ["Aave V4", `/ethereum/aave-v4/assets/${WETH}`, "0x5424384b256154046e9667ddfaaa5e550145215e"],
    ],
  );
});

test("a row has an href only where its protocol has an assets page", () => {
  const rows = tableFor(liquity, "liquity", liquityNow(), "Liquity V2");
  const hrefs = Object.fromEntries(rows.map((r) => [r.protocol.name, r.protocol.href]));
  assert.equal(hrefs.Moonwell, `/ethereum/moonwell/assets/${WETH}`);
  assert.equal(hrefs.Maker, `/ethereum/makerdao/assets/${WETH}`);
  assert.equal(hrefs.Dolomite, null);
  assert.equal(hrefs.Pendle, null);
  assert.equal(hrefs["Morpho Blue"], null);
});

// USDC on Ethereum as Morpho Blue reads it: Compound V3's cUSDCv3 on the charted line, cWETHv3 on another.
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const CHAINLINK_USDC = "0x8fffffd4afb6115b954bd326cbe7b4ba576818f6";
const usdcRoster = {
  readAt: {},
  native: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  related: [],
  assets: [
    {
      chain: 1,
      token: USDC,
      symbol: "USDC",
      underlying: null,
      wrapped: [],
      lines: [
        rl(CHAINLINK_USDC, "Chainlink USDC / USD", "chainlink", [
          s(`aave-v3:core:${USDC}`, "Aave V3 Core", 19384),
          s(`aave-v3:prime:${USDC}`, "Aave V3 Prime", 19933),
          s(`aave-v4:${USDC}`, "Aave V4", 20535),
          s(`cv3:0xc3d688b66703497daa19211eedff47f25384cdc3:${USDC}`, "Compound V3 cUSDCv3", 19230),
        ]),
        rl(
          "0x986b5e1e1755e3c2440e960477f25201b0a8bbd4",
          "Chainlink USDC / ETH",
          "chainlink",
          [s(`cv3:0xa17581a9e3356d9a858b789d68b4d866e593ae94:${USDC}`, "Compound V3 cWETHv3", 19381)],
          { label: { kind: "priced in ETH, × WETH/USD" } },
        ),
      ],
    },
  ],
};
const usdcPage = assetPage(usdcRoster, 1);
const usdcFrom = (id, label) => {
  const { page: p, view: v } = viaPage(usdcPage, { id, label, chain: 1 });
  const section = p.chains[0];
  return { section, view: v, line: section.lines.find((l) => l.id === v.lineId) ?? section.lines[0] };
};
const usdcMorpho = usdcFrom("morpho", "Morpho Blue");
const usdcPageOf = (id) => ({ "aave-v3": 1, "aave-v4": 1, compound: 1 })[id] ? `/ethereum/${id}/assets/${USDC}` : null;
const usdcRows = () => {
  const now = sameBlock({ [usdcMorpho.line.id]: 0.9999, [usdcMorpho.section.lines[1].id]: 1.0001 });
  const multi = view.multiLineFamilies(usdcMorpho.section.lines);
  const reads = view.alsoReads(usdcMorpho.line, "morpho", usdcPageOf, multi);
  const other = view.oracleRows(usdcMorpho.section.lines, usdcMorpho.line, now, usdcPageOf);
  return view.tableRows(view.sameRows(usdcMorpho.line, reads, null, now), other, []);
};

test("a protocol that reads two lines gets a row per market, both linked to its page", () => {
  assert.deepEqual([...view.multiLineFamilies(usdcMorpho.section.lines)], ["Compound V3"]);
  const rows = usdcRows();
  assert.deepEqual(
    rows.map((r) => [r.group, r.protocol.name, r.name]),
    [
      ["same", "Compound V3 cUSDCv3", "The price charted above"],
      ["same", "Aave V3", "The price charted above"],
      ["same", "Aave V4", "The price charted above"],
      ["other", "Compound V3 cWETHv3", "Chainlink USDC / ETH"],
    ],
  );
  const comp = rows.filter((r) => r.protocol.name.startsWith("Compound V3"));
  assert.equal(comp[0].protocol.href, comp[1].protocol.href);
  assert.deepEqual([comp[0].price.text, comp[1].price.text], ["$0.9999", "$1.0001"]);
  assert.equal(comp[1].kind, "Priced in ETH, × WETH/USD", "the USDC / ETH line says how its dollars are made");
});

test("row labels are unique on the Morpho USDC page and name the market", () => {
  const labels = usdcRows().map(view.rowLabel);
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(labels.includes("Compound V3 cUSDCv3: The price charted above, $0.9999"));
  assert.ok(labels.includes("Compound V3 cWETHv3: Chainlink USDC / ETH, $1.0001"));
  const listed = view.listedRows([{ name: "Pendle", explorer: "pendle", href: null, reason: null }], sameBlock({}));
  assert.equal(view.rowLabel(listed[0]), "Pendle: Not saved by Rails");
});

test("the page protocol's markets under the chart, with their first stored days", () => {
  const aave = from("aave-v3", "Aave V3");
  assert.equal(view.historyLine(aave.line, "aave-v3"), "Core since 27 Jan 2023 · Prime since 29 Jul 2024");
  assert.equal(view.historyLine(liquity.line, "liquity"), "Stored since 19 May 2025");
  assert.equal(view.historyLine(morpho.line, null), null, "a page with no line of its own has none");
  assert.equal(view.historyLine(maker.line, "aave-v3"), null);
});

test("the chart header's price carries cents, as the table's", () => {
  const p = { ok: true, price: 1705.28, block: 1, timestamp: TS, read: "latestRoundData()" };
  assert.equal(view.priceCell(p).text, "$1,705.28");
});

test("the intro above the table, in its three cases", () => {
  const o = { chain: "Ethereum", symbol: "WETH", sameBlock: false, gapFrom: "Liquity V2's price" };
  assert.equal(
    view.tableIntro(o),
    "The table below shows how other protocols on Ethereum price WETH: the oracle each one reads and its latest price.",
  );
  assert.equal(
    view.tableIntro({ ...o, sameBlock: true }),
    "The table below shows how other protocols on Ethereum price WETH: the oracle each one reads, its price at one block and its gap from Liquity V2's price.",
  );
  assert.equal(
    view.tableIntro({ ...o, symbol: "USDC", sameBlock: true, gapFrom: "the price charted above" }),
    "The table below shows how other protocols on Ethereum price USDC: the oracle each one reads, its price at one block and its gap from the price charted above.",
  );
});

test("a Maker line with no hop drops the duration clause; other hops are worded", () => {
  const bare = { ...maker.line, oracle: { ...maker.line.oracle, hop: undefined } };
  assert.equal(view.sourceLine(bare, "makerdao").words, "Maker OSM over the Chronicle ETH/USD median");
  const two = { ...maker.line, oracle: { ...maker.line.oracle, hop: 7200 } };
  assert.equal(view.sourceLine(two, "makerdao").words, "Chronicle median, held 2 hours by Maker's OSM");
});

test("a row the page's own protocol owns stays in the table with no link", () => {
  const now = sameBlock({ [usdcMorpho.line.id]: 0.9999, [usdcMorpho.section.lines[1].id]: 1.0001 });
  const pageOf = (id) => `/ethereum/${id}/assets/${USDC}`;
  const rows = view.oracleRows(usdcMorpho.section.lines, usdcMorpho.line, now, view.rowPageOf("compound", pageOf));
  const comp = rows.find((r) => r.protocol.name === "Compound V3 cWETHv3");
  assert.ok(comp, "the row is kept");
  assert.equal(comp.protocol.href, null);
  assert.equal(view.rowPageOf("compound", pageOf)("aave-v3"), pageOf("aave-v3"));
});
