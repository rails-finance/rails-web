// The list under a protocol's asset chart (lib/shared/asset-readers.ts; Miles,
// 24 Nov 2026, ui-jobs 818): the other protocols reading the token, one entry
// per line. Fixtures from the roster's WETH and USDC on Ethereum (GET
// /api/prices/assets, 24 Nov 2026). Run: npm test
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

const { andList, readerEntries, readerText } = await import("../../lib/shared/asset-readers.ts");
const { viaPage } = await import("../../lib/shared/asset-via.ts");

const WETH = { chain: 1, token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", symbol: "WETH" };
const s = (key, protocol, extra = {}) => ({ key, protocol, firstDay: 19000, lastDay: null, token: WETH, ...extra });
const line = (address, name, kind, series) => ({
  id: `1:${address}`,
  oracle: { address, name, kind },
  protocols: [...new Set(series.map((x) => x.protocol))],
  readers: 0,
  span: 0,
  drawn: series[0],
  series,
});

// WETH on Ethereum in the chart's order: three Chainlink ETH / USD proxies at three addresses.
const aave = line("0x5424384b256154046e9667ddfaaa5e550145215e", "Chainlink ETH / USD", "chainlink", [
  s("aave-v3:core:0xc02a", "Aave V3 Core"),
  s("aave-v3:prime:0xc02a", "Aave V3 Prime"),
  s("aave-v4:0xc02a", "Aave V4"),
]);
const liquity = line("0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419", "Chainlink ETH / USD", "chainlink", [
  s("liquity-v2:WETH", "Liquity V2", { via: { address: "0xcc5f", name: "Liquity V2 WETH PriceFeed", kind: "pass" } }),
  s("moonwell:0xb85c", "Moonwell", { via: { address: "0xa0f8", name: "Moonwell's OEV wrapper", kind: "pass" } }),
]);
const osm = line("0x81fe72b5a8d1a857d176c3e7d5bd2679a9b85763", "Maker OSM over the Chronicle ETH/USD median", "osm", [
  s("maker:ETH-A", "Maker ETH-A"),
  s("maker:ETH-B", "Maker ETH-B"),
  s("maker:ETH-C", "Maker ETH-C"),
]);
const comet = line("0xc0053f3fbccd593758258334dfce24c2a9a673ad", "Chainlink ETH / USD", "chainlink", [
  s("cv3:0xc3d6:0xc02a", "Compound V3 cUSDCv3"),
  s("cv3:0xa175:0xc02a", "Compound V3 cWETHv3"),
]);
const spark = line(
  "0x2750e4cb635af1fccfb10c0ea54b5b5bfc2759b6",
  "Aggregated price feed ETH/USD from Chronicle, Chainlink, and RedStone oracles",
  "adapter",
  [s("spark:0xc02a", "SparkLend")],
);
const dolomite = line("0xa150ef2d5827db283321d15d62d5d07fb41d636e", "Dolomite oracle aggregator", "protocol", [
  s("dolomite:0", "Dolomite"),
]);
const page = { symbol: "WETH", token: WETH.token, underlying: null, wrapped: [], chains: [] };
const section = { chain: 1, name: "Ethereum", lines: [aave, liquity, osm, comet, spark, dolomite], readAt: null };
page.chains = [section];

const HREFS = { "aave-v3": "/ethereum/aave-v3", "aave-v4": "/ethereum/aave-v4", liquity: "/ethereum/liquity-v2" };
const pageOf = (id) => (HREFS[id] ? `${HREFS[id]}/assets/${WETH.token}` : null);
const from = (explorer) => {
  const { page: p, view } = viaPage(page, explorer);
  return { section: p.chains[0], view };
};

test("WETH on Liquity V2: every other protocol by line, Moonwell on Liquity V2's feed first", () => {
  const { section: sec, view } = from({ id: "liquity", label: "Liquity V2", chain: 1 });
  const list = readerEntries(sec, view, pageOf);
  assert.deepEqual(list.map(readerText), [
    "Moonwell reads Chainlink ETH / USD 0x5f4e…8419, the same feed as Liquity V2",
    "Aave V3 and Aave V4 read Chainlink ETH / USD 0x5424…215e",
    "Maker reads an hour-delayed price: Maker OSM over the Chronicle ETH/USD median",
    "Compound V3 reads Chainlink ETH / USD 0xc005…73ad",
    "SparkLend reads Aggregated price feed ETH/USD from Chronicle, Chainlink, and RedStone oracles",
    "Dolomite reads the Dolomite oracle aggregator",
  ]);
  assert.ok(!list.some((e) => e.protocols.some((p) => p.explorer === "liquity")), "the page's protocol is left out");
});

test("the same feed is said only on the page protocol's line, by its address", () => {
  const { section: sec, view } = from({ id: "aave-v3", label: "Aave V3", chain: 1 });
  const list = readerEntries(sec, view, pageOf);
  const same = list.filter((e) => e.sameAs != null);
  assert.deepEqual(
    same.map((e) => [e.id, e.sameAs]),
    [[aave.id, "Aave V3"]],
    "Aave V4 shares Aave V3's address; Liquity V2's and Compound V3's Chainlink ETH / USD are other addresses",
  );
  assert.equal(readerText(same[0]), "Aave V4 reads Chainlink ETH / USD 0x5424…215e, the same feed as Aave V3");
  // From Maker's side its OSM is the chart; no other protocol reads it, so nothing is the same feed.
  const maker = from({ id: "makerdao", label: "MakerDAO", chain: 1 });
  const mlist = readerEntries(maker.section, maker.view, pageOf);
  assert.ok(mlist.every((e) => e.sameAs == null));
  assert.equal(mlist.length, 5);
  assert.equal(readerText(mlist[1]), "Liquity V2 and Moonwell read Chainlink ETH / USD 0x5f4e…8419");
});

test("each protocol links its page for the token, where it has one", () => {
  const { section: sec, view } = from({ id: "liquity", label: "Liquity V2", chain: 1 });
  const [, aaves] = readerEntries(sec, view, pageOf);
  assert.deepEqual(
    aaves.protocols.map((p) => [p.name, p.href]),
    [
      ["Aave V3", `/ethereum/aave-v3/assets/${WETH.token}`],
      ["Aave V4", `/ethereum/aave-v4/assets/${WETH.token}`],
    ],
  );
  const [moonwell] = readerEntries(sec, view, pageOf);
  assert.equal(moonwell.protocols[0].href, null, "no page given, no link");
});

test("a page whose protocol stores no line lists every line's readers, and none is the same feed", () => {
  const { section: sec, view } = from({ id: "morpho", label: "Morpho Blue", chain: 1 });
  assert.equal(view.lineId, null);
  const list = readerEntries(sec, view, pageOf);
  assert.equal(list.length, 6, "the most-read line's readers too");
  assert.equal(readerText(list[0]), "Aave V3 and Aave V4 read Chainlink ETH / USD 0x5424…215e");
  assert.ok(list.every((e) => e.sameAs == null));
});

test("retired markets read nothing; a protocol on two lines is named by its markets; a fixed line says so once", () => {
  const USDC = { ...WETH, token: "0xa0b8", symbol: "USDC" };
  const u = (key, protocol, extra = {}) => s(key, protocol, { token: USDC, ...extra });
  const cl = line("0x8fff", "Chainlink USDC / USD", "chainlink", [
    u("cv2:0x39aa", "Compound V2"),
    u("cv3:0xc3d6:0xa0b8", "Compound V3 cUSDCv3"),
  ]);
  const usdEth = line("0x986b", "Chainlink USDC / ETH", "chainlink", [u("cv3:0xa175:0xa0b8", "Compound V3 cWETHv3")]);
  const dsvalue = line("0x77b6", "Maker fixed at 1.00 (a DSValue)", "fixed", [
    u("maker:USDC-A", "Maker USDC-A", { retired: true }),
    u("maker:PSM-USDC-A", "Maker PSM-USDC-A"),
  ]);
  const gone = line("0xdead", "A feed", "fixed", [u("maker:USDC-B", "Maker USDC-B", { retired: true })]);
  const list = readerEntries({ lines: [cl, usdEth, dsvalue, gone] }, null, () => null);
  assert.deepEqual(list.map(readerText), [
    "Compound V2 and Compound V3 cUSDCv3 read Chainlink USDC / USD",
    "Compound V3 cWETHv3 reads Chainlink USDC / ETH",
    "Maker reads Maker fixed at 1.00 (a DSValue)",
  ]);
  const plain = line("0x42a0", "A constant", "fixed", [u("spark:0xa0b8", "SparkLend")]);
  assert.equal(
    readerText(readerEntries({ lines: [plain] }, null, () => null)[0]),
    "SparkLend reads a fixed price: A constant",
  );
});

test("names join with commas and a last and", () => {
  assert.equal(andList(["A"]), "A");
  assert.equal(andList(["A", "B"]), "A and B");
  assert.equal(andList(["A", "B", "C"]), "A, B and C");
});
