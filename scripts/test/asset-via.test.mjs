// An asset page read from a protocol's side (lib/shared/asset-via.ts) and the
// explorer's categories (lib/shared/asset-categories.ts); rails-ops
// reference/asset-key-map.md, "Read from a protocol" and "The asset explorer".
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  lineExplorers,
  lineReaderKeys,
  safeFrom,
  seriesExplorer,
  viaLineOf,
  viaName,
  viaPage,
  withVia,
} from "../../lib/shared/asset-via.ts";
import { assetCategory } from "../../lib/shared/asset-categories.ts";

const tok = { chain: 1, token: "0x7f39", symbol: "wstETH" };
const s = (key, protocol, extra = {}) => ({ key, protocol, firstDay: 100, lastDay: null, token: tok, ...extra });
const line = (id, series, drawn = true) => ({
  id,
  oracle: { address: id, name: id, kind: "feed" },
  protocols: [...new Set(series.map((x) => x.protocol))],
  readers: 0,
  span: 0,
  drawn: drawn ? series[0] : null,
  series,
});

// wstETH on Ethereum: the most-read line, then Aave V3's CAPO, then Maker's OSM.
const most = line("1:0xmoonwell", [
  s("moonwell:0xm", "Moonwell"),
  s("cv3:0xc:0x7f", "Compound V3 cUSDCv3"),
  s("spark:0x7f", "SparkLend"),
]);
const capo = line("1:0xcapo", [s("aave-v3:core:0x7f", "Aave V3 Core"), s("aave-v3:prime:0x7f", "Aave V3 Prime")]);
const osm = line("1:0xosm", [
  s("maker:WSTETH-A", "Maker WSTETH-A"),
  s("maker:WSTETH-B", "Maker WSTETH-B", { retired: true }),
]);
const page = {
  symbol: "wstETH",
  token: "0x7f39",
  underlying: null,
  wrapped: [],
  chains: [
    { chain: 1, name: "Ethereum", lines: [most, capo, osm], readAt: null },
    {
      chain: 8453,
      name: "Base",
      lines: [line("8453:0xb", [s("seamless:0xw", "Seamless", { token: { ...tok, chain: 8453 } })])],
      readAt: null,
    },
  ],
};

test("a series key names its explorer per chain", () => {
  assert.equal(seriesExplorer(1, "aave-v3:core:0x7f"), "aave-v3");
  assert.equal(seriesExplorer(1, "cv3:0xc:0x7f"), "compound");
  assert.equal(seriesExplorer(8453, "cv3:0xc:0x7f"), "compound-base");
  assert.equal(seriesExplorer(1, "liquity-v2:WETH"), "liquity");
  assert.equal(seriesExplorer(1, "maker:ETH-A"), "makerdao");
  assert.equal(seriesExplorer(8453, "maker:ETH-A"), null);
  assert.deepEqual(lineExplorers(capo), { "aave-v3": ["Aave V3 Core", "Aave V3 Prime"] });
});

test("the explorer's line: the one with most of its series, a retired market not counted", () => {
  assert.equal(viaLineOf(page.chains[0].lines, "aave-v3"), capo);
  assert.equal(viaLineOf(page.chains[0].lines, "makerdao"), osm);
  assert.equal(viaLineOf(page.chains[0].lines, "morpho"), null);
  // A line with nothing stored is not a line the page can draw.
  assert.equal(viaLineOf([line("x", [s("aave-v3:core:0x7f", "Aave V3 Core")], false)], "aave-v3"), null);
});

test("the name: one market as the line names it, else the explorer", () => {
  assert.equal(viaName(["Aave V3 Core"], "Aave V3"), "Aave V3 Core");
  assert.equal(viaName(["Aave V3 Core", "Aave V3 Prime"], "Aave V3"), "Aave V3");
  assert.equal(viaName(undefined, "Morpho Blue"), "Morpho Blue");
  assert.equal(viaName(["Liquity V2"], "Liquity V2", "wstETH"), "Liquity V2's wstETH branch");
  assert.equal(viaName(["Compound V3 cUSDCv3"], "Compound V3", "0xc3d6"), "Compound V3 cUSDCv3");
});

test("via puts the explorer's chain first and its line first on it", () => {
  const base = viaPage(page, { id: "seamless", label: "Seamless", chain: 8453 });
  assert.deepEqual(
    base.page.chains.map((c) => c.chain),
    [8453, 1],
  );
  assert.equal(base.view.lineId, "8453:0xb");
  assert.equal(base.view.usualId, null);

  const aave = viaPage(page, { id: "aave-v3", label: "Aave V3", chain: 1 });
  assert.deepEqual(
    aave.page.chains[0].lines.map((l) => l.id),
    ["1:0xcapo", "1:0xmoonwell", "1:0xosm"],
  );
  assert.equal(aave.view.name, "Aave V3");
  assert.equal(aave.view.usualId, "1:0xmoonwell");

  // No line: the page keeps its order and says so.
  const morpho = viaPage(page, { id: "morpho", label: "Morpho Blue", chain: 1 });
  assert.equal(morpho.view.lineId, null);
  assert.deepEqual(
    morpho.page.chains[0].lines.map((l) => l.id),
    ["1:0xmoonwell", "1:0xcapo", "1:0xosm"],
  );
  // An explorer on a chain the page has no chart on.
  assert.equal(viaPage(page, { id: "aave-v3-arbitrum", label: "Aave V3", chain: 42161 }).view, null);
});

test("from is a path on this site, and the link carries it with via", () => {
  assert.equal(safeFrom("/ethereum/aave-v3/0xabc?tab=1"), "/ethereum/aave-v3/0xabc?tab=1");
  assert.equal(safeFrom("//evil.example"), null);
  assert.equal(safeFrom("https://evil.example"), null);
  assert.equal(safeFrom("/\\evil"), null);
  assert.equal(safeFrom(undefined), null);
  assert.equal(withVia("/assets/ethereum/0x7f39", null, "/x"), "/assets/ethereum/0x7f39");
  assert.equal(
    withVia("/assets/ethereum/0x7f39", "aave-v3", "/ethereum/aave-v3/0xabc"),
    "/assets/ethereum/0x7f39?via=aave-v3&from=%2Fethereum%2Faave-v3%2F0xabc",
  );
  assert.equal(withVia("/assets/ethereum/0x7f39", "aave-v3", "//evil"), "/assets/ethereum/0x7f39?via=aave-v3");
});

test("categories: governance, utility, pool shares, principal tokens, real-world assets", () => {
  assert.equal(assetCategory("AAVE"), "governance");
  assert.equal(assetCategory("LINK"), "utility");
  assert.equal(assetCategory("DEGEN"), "utility");
  assert.equal(assetCategory("UNI-V2"), "lp-share");
  assert.equal(assetCategory("PT-sUSDE-25SEP2025"), "principal-token");
  assert.equal(assetCategory("RWA009"), "rwa");
  assert.equal(assetCategory("PAXG"), "rwa");
  assert.equal(assetCategory("aDAI"), "yield-stable");
  assert.equal(assetCategory("BOLD"), "stablecoin");
  assert.equal(assetCategory("MALLY"), "other");
});

test("a market narrows the line where a line carries it, else the explorer's line stands", () => {
  const prime = line("1:0xprime", [s("aave-v3:prime:0x7f", "Aave V3 Prime")]);
  const core = line("1:0xcore", [s("aave-v3:core:0x7f", "Aave V3 Core"), s("aave-v3:etherfi:0x7f", "Aave V3 EtherFi")]);
  assert.equal(viaLineOf([core, prime], "aave-v3"), core);
  assert.equal(viaLineOf([core, prime], "aave-v3", "prime"), prime);
  assert.equal(viaLineOf([core, prime], "aave-v3", "nowhere"), core);
  assert.deepEqual(lineExplorers(core, "core"), { "aave-v3": ["Aave V3 Core"] });
  assert.deepEqual(lineReaderKeys(prime), { "aave-v3": ["Aave V3 Prime"], "aave-v3:prime": ["Aave V3 Prime"] });
  const v = viaPage(
    { ...page, chains: [{ ...page.chains[0], lines: [core, prime] }] },
    {
      id: "aave-v3",
      label: "Aave V3",
      chain: 1,
      market: "core",
    },
  );
  assert.equal(v.view.name, "Aave V3 Core");
});
