// VERIFY: Ebisu's five PriceFeed grades (lib/ebisu/price-feeds.ts) against
// mainnet.
// ----------------------------------------------------------------------------
// Reads the grades from the TypeScript source (no mirror), then, at one pinned
// block and in one multicall:
//   1. each PriceFeed answers priceSource() == 0 (primary) and its getters name
//      the graded legs, with the graded staleness threshold and the feed's
//      decimals;
//   2. each Chainlink and RedStone leg reads the graded description, and its
//      heartbeat and deviation match the provider's published list
//      (scripts/lib/feed-parameters.mjs, HTTP, not RPC);
//   3. no oracle leg is older than its staleness threshold (FAIL) and none older
//      than its heartbeat (WARN — the PriceFeed still accepts it);
//   4. fetchPrice and fetchRedemptionPrice (simulated) equal the graded formula
//      recomputed from the legs, BigInt-exact, with the redemption band read
//      from the contract;
//   5. the lastGoodPrice-vs-fetchPrice gap per branch, printed for the record.
//
// Run:  node --experimental-strip-types --no-warnings scripts/verify-ebisu-price-feeds.mjs
// Env:  .env.local — ALCHEMY_URL (mainnet)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import { EBISU_PRICE_GRADES } from "../lib/ebisu/price-feeds.ts";
import { chainlinkDirectory, redstoneManifest } from "./lib/feed-parameters.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ALCHEMY_URL) throw new Error("ALCHEMY_URL missing from .env.local");

// The branch roster from lib/ebisu/asset-catalog.ts, read as text: that module
// imports through the "@/" alias, which node does not resolve.
const catalog = readFileSync(join(root, "lib/ebisu/asset-catalog.ts"), "utf8");
const BRANCHES = [
  ...catalog.matchAll(/key: "(\w+)",\s*symbol: "(\w+)",\s*decimals: (\d+),[\s\S]*?priceFeed: "(0x[0-9a-f]{40})"/g),
].map(([, key, symbol, decimals, priceFeed]) => ({ key, symbol, decimals: Number(decimals), priceFeed }));
if (BRANCHES.length !== 5) throw new Error(`expected 5 branches in asset-catalog.ts, parsed ${BRANCHES.length}`);

const client = createPublicClient({
  chain: mainnet,
  transport: http(env.ALCHEMY_URL, { retryCount: 8, retryDelay: 1_000 }),
});

const ORACLE_GETTERS = ["ethUsdOracle", "weEthEthOracle", "sUSDeUsdOracle", "wbtcBtcOracle", "lbtcBtcOracle"];
const PF_ABI = parseAbi([
  "function priceSource() view returns (uint8)",
  "function lastGoodPrice() view returns (uint256)",
  "function fetchPrice() view returns (uint256, bool)",
  "function fetchRedemptionPrice() view returns (uint256, bool)",
  "function rateProviderAddress() view returns (address)",
  "function sUsde() view returns (address)",
  "function yieldBearingToken() view returns (address)",
  ...ORACLE_GETTERS.map((g) => `function ${g}() view returns (address, uint256, uint8)`),
  "function WEETH_ETH_DEVIATION_THRESHOLD() view returns (uint256)",
  "function SUSDE_USD_DEVIATION_THRESHOLD() view returns (uint256)",
  "function WBTC_USD_DEVIATION_THRESHOLD() view returns (uint256)",
  "function LBTC_USD_DEVIATION_THRESHOLD() view returns (uint256)",
]);
const FEED_ABI = parseAbi([
  "function description() view returns (string)",
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
]);
const RATE_ABI = parseAbi([
  "function getRate() view returns (uint256)",
  "function previewRedeem(uint256) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
]);

let pass = 0;
let fail = 0;
let warn = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const note = (name, detail) => {
  warn++;
  console.log(`  WARN  ${name} — ${detail}`);
};
const eq = (a, b) => a.toLowerCase() === b.toLowerCase();
const hrs = (s) => `${(Number(s) / 3600).toFixed(2)} h`;
const E18 = BigInt("1000000000000000000");
const E10 = BigInt("10000000000");
const BAND = BigInt("20000000000000000"); // 2%
const min = (a, b) => (a < b ? a : b);
const max = (a, b) => (a > b ? a : b);
// The PriceFeeds' _withinDeviationThreshold
const within = (x, ref, t) => x >= (ref * (E18 - t)) / E18 && x <= (ref * (E18 + t)) / E18;
const scaled = (answer, decimals) => answer * BigInt(10) ** BigInt(18 - decimals);

// The redemption band constant per branch, and the PriceFeed arithmetic from
// the verified sources. `L` holds each leg's 18-decimal value by label.
const BAND_GETTER = {
  weeth: "WEETH_ETH_DEVIATION_THRESHOLD",
  susde: "SUSDE_USD_DEVIATION_THRESHOLD",
  wbtc: "WBTC_USD_DEVIATION_THRESHOLD",
  lbtc: "LBTC_USD_DEVIATION_THRESHOLD",
};
const btcRecompute = (x) => (L) => {
  const usd = (L["BTC/USD"] * L[x]) / E18;
  const price = min(usd, L["BTC/USD"]) * E10;
  const redemption = (within(usd, L["BTC/USD"], BAND) ? max(usd, L["BTC/USD"]) : min(usd, L["BTC/USD"])) * E10;
  return { price, redemption };
};
const RECOMPUTE = {
  weeth: (L) => {
    const market = (L["ETH/USD"] * L["weETH/ETH"]) / E18;
    const canonical = (L["ETH/USD"] * L["weETH rate"]) / E18;
    const price = min(market, canonical);
    return { price, redemption: within(market, canonical, BAND) ? max(market, canonical) : price };
  },
  susde: (L) => {
    const canonical = (L["USDe/USD"] * L["sUSDe rate"]) / E18;
    const price = min(L["sUSDe/USD"], canonical);
    return {
      price,
      redemption: within(L["sUSDe/USD"], canonical, BAND) ? max(L["sUSDe/USD"], canonical) : price,
    };
  },
  wbtc: btcRecompute("WBTC/BTC"),
  lbtc: btcRecompute("LBTC/BTC"),
  stcusd: (L) => {
    const p = (L["cUSD/USD"] * L["stcUSD rate"]) / E18;
    return { price: p, redemption: p };
  },
};
const RATE_CALL = {
  "weETH rate": ["getRate", []],
  "sUSDe rate": ["previewRedeem", [E18]],
  "stcUSD rate": ["convertToAssets", [E18]],
};

const [cl, rs] = await Promise.all([chainlinkDirectory("mainnet"), redstoneManifest("ethereumMultiFeed")]);
if (!cl) note("Chainlink directory", "fetch failed; heartbeat and deviation unchecked for Chainlink legs");
if (!rs) note("RedStone manifest", "fetch failed; heartbeat and deviation unchecked for RedStone legs");

const blockNumber = await client.getBlockNumber();
const now = BigInt((await client.getBlock({ blockNumber })).timestamp);
console.log(`Ebisu PriceFeeds @ mainnet block ${blockNumber} (${new Date(Number(now) * 1000).toISOString()})\n`);

// One multicall for everything. Per PriceFeed, lastGoodPrice is read before
// fetchPrice, which rewrites it inside the same simulation.
const calls = [];
const at = (address, abi, functionName, args = []) => calls.push({ address, abi, functionName, args }) - 1;
const plan = BRANCHES.map((b) => {
  const g = EBISU_PRICE_GRADES[b.key];
  if (!g) return { b, g };
  const idx = {
    priceSource: at(b.priceFeed, PF_ABI, "priceSource"),
    lastGoodPrice: at(b.priceFeed, PF_ABI, "lastGoodPrice"),
    band: BAND_GETTER[b.key] && at(b.priceFeed, PF_ABI, BAND_GETTER[b.key]),
    legs: g.legs.map((leg) =>
      leg.source === "rate"
        ? {
            getter: at(b.priceFeed, PF_ABI, leg.getter),
            value: at(leg.address, RATE_ABI, RATE_CALL[leg.label][0], RATE_CALL[leg.label][1]),
          }
        : {
            getter: at(b.priceFeed, PF_ABI, leg.getter),
            description: at(leg.address, FEED_ABI, "description"),
            decimals: at(leg.address, FEED_ABI, "decimals"),
            round: at(leg.address, FEED_ABI, "latestRoundData"),
          },
    ),
    fetchPrice: at(b.priceFeed, PF_ABI, "fetchPrice"),
    fetchRedemptionPrice: at(b.priceFeed, PF_ABI, "fetchRedemptionPrice"),
  };
  return { b, g, idx };
});
const res = await client.multicall({ contracts: calls, blockNumber, batchSize: 0 });
const R = (i) => {
  if (res[i].status !== "success") throw new Error(`${calls[i].functionName} on ${calls[i].address} failed`);
  return res[i].result;
};
console.log(`(${calls.length} reads in one multicall)\n`);

for (const { b, g, idx } of plan) {
  check(`${b.key}: grade present`, Boolean(g));
  if (!g) continue;
  console.log(`${b.symbol} — ${g.contractName} ${b.priceFeed} = ${g.formula}`);
  check(`${b.key}: priceSource() == 0 (primary)`, R(idx.priceSource) === 0);

  const L = {};
  g.legs.forEach((leg, j) => {
    const r = idx.legs[j];
    if (leg.source === "rate") {
      const addr = R(r.getter);
      check(
        `${b.key}: ${leg.getter} = ${leg.read.split(".")[0]} ${leg.address}`,
        eq(addr, leg.address),
        `chain ${addr}`,
      );
      L[leg.label] = R(r.value);
      console.log(`  info  ${leg.label} = ${(Number(L[leg.label]) / 1e18).toFixed(6)} (${leg.read})`);
      return;
    }
    const [addr, staleness, dec] = R(r.getter);
    const feedDec = R(r.decimals);
    check(
      `${b.key}: ${leg.getter} = ${leg.label} feed, ${hrs(leg.stalenessS)} staleness, ${feedDec} dp`,
      eq(addr, leg.address) && Number(staleness) === leg.stalenessS && dec === feedDec,
      `chain ${addr} · ${staleness} s · ${dec} dp`,
    );
    const desc = R(r.description);
    check(`  ${leg.label}: description "${leg.feedName}"`, desc === leg.feedName, `chain "${desc}"`);
    const pub = (leg.source === "chainlink" ? cl : rs)?.get(leg.address);
    if (pub)
      check(
        `  ${leg.label}: published ${leg.deviationPct}% deviation, ${hrs(leg.heartbeatS)} heartbeat`,
        pub.deviationPct === leg.deviationPct && pub.heartbeatS === leg.heartbeatS,
        `${leg.source} ${pub.deviationPct}% · ${pub.heartbeatS} s`,
      );
    else if (leg.source === "chainlink" ? cl : rs) note(`  ${leg.label}`, "not in the provider's published list");
    const [, answer, , updatedAt] = R(r.round);
    const age = now - updatedAt;
    L[leg.label] = scaled(answer, feedDec);
    check(
      `  ${leg.label}: age ${hrs(age)} under the ${hrs(leg.stalenessS)} threshold`,
      age < BigInt(leg.stalenessS) && answer > BigInt(0),
    );
    if (age > BigInt(leg.heartbeatS))
      note(`  ${leg.label}: age`, `${hrs(age)} is past the ${hrs(leg.heartbeatS)} heartbeat`);
  });

  if (idx.band !== undefined) check(`${b.key}: redemption band ${BAND_GETTER[b.key]} = 2%`, R(idx.band) === BAND);

  const [fetched, down] = R(idx.fetchPrice);
  const [redeem] = R(idx.fetchRedemptionPrice);
  const want = RECOMPUTE[b.key](L);
  const scale = 10 ** (36 - b.decimals);
  const usd = (x) => (Number(x) / scale).toLocaleString("en-US", { maximumFractionDigits: 4 });
  check(
    `${b.key}: fetchPrice = ${g.formula}, BigInt-exact`,
    fetched === want.price && !down,
    `${usd(fetched)} vs ${usd(want.price)}`,
  );
  check(
    `${b.key}: fetchRedemptionPrice = graded redemption rule`,
    redeem === want.redemption,
    `${usd(redeem)} vs ${usd(want.redemption)}`,
  );

  const lgp = R(idx.lastGoodPrice);
  const gap = ((Number(fetched) - Number(lgp)) / Number(lgp)) * 100;
  console.log(`  info  lastGoodPrice ${usd(lgp)} · fetchPrice ${usd(fetched)} · gap ${gap.toFixed(2)}%\n`);
}

console.log(`${pass} passed, ${fail} failed, ${warn} warnings`);
process.exit(fail > 0 ? 1 : 0);
