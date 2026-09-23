// VERIFY: Basedollar's five PriceFeed grades (lib/basedollar/price-feeds.ts)
// against Base.
// ----------------------------------------------------------------------------
// Reads the grades from the TypeScript source (no mirror), then, at one pinned
// block:
//   1. each PriceFeed answers priceSource() == 0 (primary) and its oracle
//      getters name the graded legs, with the graded staleness threshold and
//      18 decimals;
//   2. each API3 leg is an Api3ReaderProxyV1 (version 4913) reading the graded
//      dAPI name, and AirseekerRegistry holds the graded deviation and
//      heartbeat; the dAPI subscription runs to the recorded end date;
//   3. no leg is older than its staleness threshold (FAIL) and none older than
//      its heartbeat (WARN — the PriceFeed still accepts it);
//   4. fetchPrice and fetchRedemptionPrice (simulated) equal the graded
//      formula recomputed from the legs, BigInt-exact;
//   5. the lastGoodPrice-vs-fetchPrice gap per branch, printed for the record.
//
// Run:  node --experimental-strip-types --no-warnings scripts/verify-basedollar-price-feeds.mjs
// Env:  .env.local — BASE_RPC_URL

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, parseAbi, stringToHex, hexToString, decodeAbiParameters } from "viem";
import { base } from "viem/chains";
import { BASEDOLLAR_PRICE_GRADES, API3_BASE, API3_SUBSCRIPTION_ENDS } from "../lib/basedollar/price-feeds.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.BASE_RPC_URL) throw new Error("BASE_RPC_URL missing from .env.local");

// The branch roster from lib/basedollar/asset-catalog.ts, read as text: that
// module imports through the "@/" alias, which node does not resolve.
const catalog = readFileSync(join(root, "lib/basedollar/asset-catalog.ts"), "utf8");
const BRANCHES = [...catalog.matchAll(/key: "(\w+)",\s*symbol: "(\w+)",[\s\S]*?priceFeed: "(0x[0-9a-f]{40})"/g)].map(
  ([, key, symbol, priceFeed]) => ({ key, symbol, priceFeed }),
);
if (BRANCHES.length !== 5) throw new Error(`expected 5 branches in asset-catalog.ts, parsed ${BRANCHES.length}`);

const client = createPublicClient({
  chain: base,
  transport: http(env.BASE_RPC_URL, { retryCount: 8, retryDelay: 1_000 }),
});

const PF_ABI = parseAbi([
  "function priceSource() view returns (uint8)",
  "function lastGoodPrice() view returns (uint256)",
  "function fetchPrice() view returns (uint256, bool)",
  "function fetchRedemptionPrice() view returns (uint256, bool)",
  "function rateProviderAddress() view returns (address)",
  "function canonicalRateStalenessThreshold() view returns (uint256)",
  "function getCanonicalRate() view returns (uint256, uint256)",
  "function ethUsdOracle() view returns (address, uint256, uint8)",
  "function stEthUsdOracle() view returns (address, uint256, uint8)",
  "function wstEthStEthOracle() view returns (address, uint256, uint8)",
  "function rEthEthOracle() view returns (address, uint256, uint8)",
  "function btcUsdOracle() view returns (address, uint256, uint8)",
  "function cbBTCUsdOracle() view returns (address, uint256, uint8)",
  "function cbEthEthOracle() view returns (address, uint256, uint8)",
]);
const PROXY_ABI = parseAbi([
  "function version() view returns (uint256)",
  "function dapiName() view returns (bytes32)",
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
]);
const API3_ABI = parseAbi([
  "function dapiNameToUpdateParameters(bytes32) view returns (bytes)",
  "function getDapiData(bytes32 dapiName) view returns (bytes, int224, uint32, int224[], uint32[], bytes[] updateParameters, uint32[] endTimestamps, uint224[])",
]);
const UPDATE_PARAMS = [{ type: "uint256" }, { type: "int224" }, { type: "uint256" }];

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
const usd = (x) => (Number(x) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 2 });
const E18 = BigInt("1000000000000000000");
const min = (a, b) => (a < b ? a : b);
const max = (a, b) => (a > b ? a : b);
// CompositePriceFeed._withinDeviationThreshold
const within = (x, ref, t) => x >= (ref * (E18 - t)) / E18 && x <= (ref * (E18 + t)) / E18;

// The PriceFeed arithmetic per branch, from the verified sources. `L` holds
// each leg's 18-decimal answer by label.
const RECOMPUTE = {
  weth: (L) => ({ price: L["ETH/USD"], redemption: L["ETH/USD"] }),
  wsteth: (L) => {
    const rate = L["wstETH/stETH"];
    const price = (L["stETH/USD"] * rate) / E18;
    const near = within(L["stETH/USD"], L["ETH/USD"], BigInt(1e16));
    return { price, redemption: near ? (max(L["stETH/USD"], L["ETH/USD"]) * rate) / E18 : price };
  },
  reth: (L) => {
    const market = (L["ETH/USD"] * L["rETH/ETH"]) / E18;
    const canonical = (L["ETH/USD"] * L["rETH rate"]) / E18;
    const price = min(market, canonical);
    return { price, redemption: within(market, canonical, BigInt(2e16)) ? max(market, canonical) : price };
  },
  wcbbtc: (L) => {
    const [cb, btc] = [L["cbBTC/USD"], L["BTC/USD"]];
    return { price: min(cb, btc), redemption: within(cb, btc, BigInt(2e16)) ? max(cb, btc) : min(cb, btc) };
  },
  cbeth: (L) => {
    const p = (L["ETH/USD"] * L["cbETH/ETH"]) / E18;
    return { price: p, redemption: p };
  },
};

const blockNumber = await client.getBlockNumber();
const now = Number((await client.getBlock({ blockNumber })).timestamp);
console.log(`Basedollar PriceFeeds @ Base block ${blockNumber} (${new Date(now * 1000).toISOString()})\n`);

const read = (address, abi, functionName, args) =>
  client.readContract({ address, abi, functionName, args, blockNumber });
const subscriptionEndsAt = Date.parse(`${API3_SUBSCRIPTION_ENDS}T00:00:00Z`) / 1000;
const seenDapi = new Map();

for (const b of BRANCHES) {
  const g = BASEDOLLAR_PRICE_GRADES[b.key];
  check(`${b.key}: grade present`, Boolean(g));
  if (!g) continue;
  console.log(`${b.symbol} — ${g.contractName} ${b.priceFeed} = ${g.formula}`);

  check(`${b.key}: priceSource() == 0 (primary)`, (await read(b.priceFeed, PF_ABI, "priceSource")) === 0);

  const L = {};
  for (const leg of g.legs) {
    if (leg.source === "api3") {
      const [addr, staleness, dec] = await read(b.priceFeed, PF_ABI, leg.getter);
      check(
        `${b.key}: ${leg.getter} = ${leg.label} proxy, ${hrs(leg.stalenessS)} staleness, 18 dp`,
        eq(addr, leg.address) && Number(staleness) === leg.stalenessS && dec === 18,
        `chain ${addr} · ${staleness} s · ${dec} dp`,
      );
      if (!seenDapi.has(leg.address)) {
        const version = await read(leg.address, PROXY_ABI, "version");
        const name = hexToString(await read(leg.address, PROXY_ABI, "dapiName")).replace(/\0+$/, "");
        const dn = stringToHex(leg.dapiName, { size: 32 });
        const [dev, , hb] = decodeAbiParameters(
          UPDATE_PARAMS,
          await read(API3_BASE.airseekerRegistry, API3_ABI, "dapiNameToUpdateParameters", [dn]),
        );
        const data = await read(API3_BASE.api3MarketV2, API3_ABI, "getDapiData", [dn]);
        const ends = data[6].length ? Math.max(...data[6].map(Number)) : 0;
        seenDapi.set(leg.address, true);
        check(`  ${leg.label}: Api3ReaderProxyV1 (version 4913)`, version === BigInt(4913), `version ${version}`);
        check(`  ${leg.label}: dapiName "${leg.dapiName}"`, name === leg.dapiName, `chain "${name}"`);
        check(
          `  ${leg.label}: AirseekerRegistry ${leg.deviationPct}% deviation, ${hrs(leg.heartbeatS)} heartbeat`,
          Number(dev) / 1e6 === leg.deviationPct && Number(hb) === leg.heartbeatS,
          `chain ${Number(dev) / 1e6}% · ${hb} s`,
        );
        check(
          `  ${leg.label}: subscription paid to ${API3_SUBSCRIPTION_ENDS} or later`,
          ends >= subscriptionEndsAt,
          `chain ${ends ? new Date(ends * 1000).toISOString() : "none"}`,
        );
        if (ends && ends - now < 30 * 86400)
          note(`  ${leg.label}: subscription`, `ends ${new Date(ends * 1000).toISOString()}, under 30 days away`);
      }
      const [, answer, , updatedAt] = await read(leg.address, PROXY_ABI, "latestRoundData");
      const age = now - Number(updatedAt);
      L[leg.label] = BigInt(answer);
      check(`  ${leg.label}: age ${hrs(age)} under the ${hrs(leg.stalenessS)} threshold`, age < leg.stalenessS);
      if (age > leg.heartbeatS) note(`  ${leg.label}: age`, `${hrs(age)} is past the ${hrs(leg.heartbeatS)} heartbeat`);
    } else {
      const provider = await read(b.priceFeed, PF_ABI, "rateProviderAddress");
      const threshold = await read(b.priceFeed, PF_ABI, "canonicalRateStalenessThreshold");
      check(
        `${b.key}: rateProviderAddress = RocketOvmPriceOracle, ${hrs(leg.stalenessS)} staleness`,
        eq(provider, leg.address) && Number(threshold) === leg.stalenessS,
        `chain ${provider} · ${threshold} s`,
      );
      const [rate, lastUpdated] = await read(b.priceFeed, PF_ABI, "getCanonicalRate");
      const age = now - Number(lastUpdated);
      L[leg.label] = rate;
      check(`  ${leg.label}: age ${hrs(age)} under the ${hrs(leg.stalenessS)} threshold`, age < leg.stalenessS);
    }
  }

  const [fetched, down] = await read(b.priceFeed, PF_ABI, "fetchPrice");
  const [redeem] = await read(b.priceFeed, PF_ABI, "fetchRedemptionPrice");
  const want = RECOMPUTE[b.key](L);
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

  const lgp = await read(b.priceFeed, PF_ABI, "lastGoodPrice");
  const gap = ((Number(fetched) - Number(lgp)) / Number(lgp)) * 100;
  console.log(`  info  lastGoodPrice ${usd(lgp)} · fetchPrice ${usd(fetched)} · gap ${gap.toFixed(2)}%\n`);
}

console.log(`${pass} passed, ${fail} failed, ${warn} warnings`);
process.exit(fail > 0 ? 1 : 0);
