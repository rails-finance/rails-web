// VERIFY: Asymmetry's seven PriceFeed grades (lib/asymmetry/price-feeds.ts)
// against mainnet.
// ----------------------------------------------------------------------------
// Reads the grades from the TypeScript source (no mirror), then, at one pinned
// block and in two multicalls:
//   1. each PriceFeed answers priceSource() == 0 (primary) and its getters name
//      the graded adapter (or BTC/USD feed), with the graded staleness threshold;
//   2. each adapter reads the graded Chainlink feed, vault and fallback adapter;
//      each fallback adapter reads the graded Curve aggregator, is enabled, and
//      is owned by Asymmetry's recorded owner;
//   3. each Chainlink leg reads the graded description, and its heartbeat and
//      deviation match Chainlink's published list (HTTP, not RPC);
//   4. each adapter's answer equals the graded path recomputed from its legs —
//      the Chainlink answer while fresh, the Curve fallback once stale — and the
//      verifier says which path answered;
//   5. fetchPrice and fetchRedemptionPrice (simulated) equal the graded formula
//      recomputed from the legs, BigInt-exact, with the redemption band read
//      from the contract;
//   6. the lastGoodPrice-vs-fetchPrice gap per branch, printed for the record.
//
// Run:  node --experimental-strip-types --no-warnings scripts/verify-asymmetry-price-feeds.mjs
// Env:  .env.local — ALCHEMY_URL (mainnet)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import { ASYMMETRY_PRICE_GRADES, ASYMMETRY_FALLBACK_OWNER } from "../lib/asymmetry/price-feeds.ts";
import { chainlinkDirectory } from "./lib/feed-parameters.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ALCHEMY_URL) throw new Error("ALCHEMY_URL missing from .env.local");

// The branch roster from lib/asymmetry/asset-catalog.ts, read as text: that
// module imports through the "@/" alias, which node does not resolve.
const catalog = readFileSync(join(root, "lib/asymmetry/asset-catalog.ts"), "utf8");
const BRANCHES = [...catalog.matchAll(/key: "(\w+)",\s*symbol: "(\w+)",[\s\S]*?priceFeed: "(0x[0-9a-f]{40})"/g)].map(
  ([, key, symbol, priceFeed]) => ({ key, symbol, priceFeed }),
);
if (BRANCHES.length !== 7) throw new Error(`expected 7 branches in asset-catalog.ts, parsed ${BRANCHES.length}`);

const client = createPublicClient({
  chain: mainnet,
  transport: http(env.ALCHEMY_URL, { retryCount: 8, retryDelay: 1_000 }),
});

const PF_ABI = parseAbi([
  "function priceSource() view returns (uint8)",
  "function lastGoodPrice() view returns (uint256)",
  "function fetchPrice() view returns (uint256, bool)",
  "function fetchRedemptionPrice() view returns (uint256, bool)",
  "function ethUsdOracle() view returns (address, uint256, uint8)",
  "function btcUsdOracle() view returns (address, uint256, uint8)",
  "function DEVIATION_THRESHOLD() view returns (uint256)",
]);
const ADAPTER_ABI = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function PRIMARY_ORACLE() view returns (address)",
  "function PRIMARY_ORACLE_HEARTBEAT() view returns (uint256)",
  "function FALLBACK_ORACLE() view returns (address)",
  "function TOKEN() view returns (address)",
  "function NON_STAKED_TOKEN() view returns (address)",
  "function CL_TBTC_USD_PRICE_FEED() view returns (address)",
  "function CL_WBTC_BTC_PRICE_FEED() view returns (address)",
  "function CL_BTC_USD_PRICE_FEED() view returns (address)",
  "function CL_CBBTC_USD_PRICE_FEED() view returns (address)",
]);
const FALLBACK_ABI = parseAbi([
  "function AGG() view returns (address)",
  "function useFallback() view returns (bool)",
  "function owner() view returns (address)",
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
]);
const FEED_ABI = parseAbi([
  "function description() view returns (string)",
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function price() view returns (uint256)",
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
const ZERO = BigInt(0);
const E8 = BigInt("100000000");
const E10 = BigInt("10000000000");
const E18 = BigInt("1000000000000000000");
const BAND = BigInt("20000000000000000"); // 2%
const MAX_UINT = BigInt(2) ** BigInt(256) - BigInt(1);
const min = (a, b) => (a < b ? a : b);
const max = (a, b) => (a > b ? a : b);
const within = (x, ref, t) => x >= (ref * (E18 - t)) / E18 && x <= (ref * (E18 + t)) / E18;
const usd = (x) => (Number(x) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 4 });

// The adapter behind each branch's ethUsdOracle slot, and the getter that
// names each Chainlink feed inside it.
const ADAPTER_FEED_GETTER = {
  ScrvUsdOracle: { primary: "PRIMARY_ORACLE" },
  SusdsOracle: { primary: "PRIMARY_ORACLE" },
  SfrxUsdOracle: { primary: "PRIMARY_ORACLE" },
  TbtcOracle: { primary: "CL_TBTC_USD_PRICE_FEED" },
  WbtcOracle: { primary: "CL_WBTC_BTC_PRICE_FEED", btc: "CL_BTC_USD_PRICE_FEED" },
  CbbtcOracle: { primary: "CL_CBBTC_USD_PRICE_FEED" },
};
// Each adapter's own staleness rule, from its verified BaseOracle: every
// adapter except CbbtcOracle counts stale at `updatedAt + h <= now` (its
// `_24_HOURS` constant is 48 h and `_1_HOUR` is 24 h); CbbtcOracle's BaseOracle
// counts stale at `updatedAt + 24 h < now`.
const staleLE = (now, updatedAt, answer, h) => updatedAt + BigInt(h) <= now || answer <= ZERO;
const staleLT = (now, updatedAt, answer, h) => updatedAt + BigInt(h) < now || answer <= ZERO;
// The PriceFeed's _isValidChainlinkPrice.
const valid = (now, [, answer, , updatedAt], threshold) => now - updatedAt < threshold && answer > ZERO;

const cl = await chainlinkDirectory("mainnet");
if (!cl) note("Chainlink directory", "fetch failed; heartbeat and deviation unchecked");

const blockNumber = await client.getBlockNumber();
const now = BigInt((await client.getBlock({ blockNumber })).timestamp);
console.log(`Asymmetry PriceFeeds @ mainnet block ${blockNumber} (${new Date(Number(now) * 1000).toISOString()})\n`);

const calls = [];
const at = (address, abi, functionName, args = []) => calls.push({ address, abi, functionName, args }) - 1;
const plan = BRANCHES.map((b) => {
  const g = ASYMMETRY_PRICE_GRADES[b.key];
  if (!g) return { b, g };
  const adapter = g.legs.find((l) => l.getter === "ethUsdOracle").via;
  const feeds = g.legs.filter((l) => l.source === "chainlink");
  const rates = g.legs.filter((l) => l.source === "rate");
  const fallback = g.legs.find((l) => l.source === "curve");
  const idx = {
    priceSource: at(b.priceFeed, PF_ABI, "priceSource"),
    lastGoodPrice: at(b.priceFeed, PF_ABI, "lastGoodPrice"),
    ethUsdOracle: at(b.priceFeed, PF_ABI, "ethUsdOracle"),
    btcUsdOracle: g.contractName === "BTCPriceFeed" ? at(b.priceFeed, PF_ABI, "btcUsdOracle") : undefined,
    band: g.contractName === "BTCPriceFeed" ? at(b.priceFeed, PF_ABI, "DEVIATION_THRESHOLD") : undefined,
    adapterRound: at(adapter.address, ADAPTER_ABI, "latestRoundData"),
    adapterGetters: Object.fromEntries(
      Object.entries(ADAPTER_FEED_GETTER[adapter.name] ?? {}).map(([k, fn]) => [
        k,
        at(adapter.address, ADAPTER_ABI, fn),
      ]),
    ),
    adapterFallback: fallback ? at(adapter.address, ADAPTER_ABI, "FALLBACK_ORACLE") : undefined,
    adapterToken:
      adapter.name === "StyBoldOracle" || rates.length ? at(adapter.address, ADAPTER_ABI, "TOKEN") : undefined,
    adapterNonStaked:
      adapter.name === "StyBoldOracle" ? at(adapter.address, ADAPTER_ABI, "NON_STAKED_TOKEN") : undefined,
    feeds: feeds.map((f) => ({
      description: at(f.address, FEED_ABI, "description"),
      decimals: at(f.address, FEED_ABI, "decimals"),
      round: at(f.address, FEED_ABI, "latestRoundData"),
    })),
    rate:
      adapter.name === "StyBoldOracle"
        ? at(rates[0].address, FEED_ABI, "convertToAssets", [E8])
        : rates.length
          ? at(rates[0].address, FEED_ABI, "convertToAssets", [E18])
          : undefined,
    fallback: fallback && {
      agg: at(fallback.via.address, FALLBACK_ABI, "AGG"),
      enabled: at(fallback.via.address, FALLBACK_ABI, "useFallback"),
      owner: at(fallback.via.address, FALLBACK_ABI, "owner"),
      round: at(fallback.via.address, FALLBACK_ABI, "latestRoundData"),
      price: at(fallback.address, FEED_ABI, "price"),
    },
    fetchPrice: at(b.priceFeed, PF_ABI, "fetchPrice"),
    fetchRedemptionPrice: at(b.priceFeed, PF_ABI, "fetchRedemptionPrice"),
  };
  return { b, g, adapter, feeds, rates, fallback, idx };
});
const res = await client.multicall({ contracts: calls, blockNumber, batchSize: 0 });
const R = (i) => {
  if (res[i].status !== "success") throw new Error(`${calls[i].functionName} on ${calls[i].address} failed`);
  return res[i].result;
};

// Second round: yBOLD.convertToAssets of st-yBOLD's answer, which the first
// round supplies.
const sty = plan.find((p) => p.adapter?.name === "StyBoldOracle");
const yBoldAssets = sty
  ? await client.readContract({
      address: sty.rates[1].address,
      abi: FEED_ABI,
      functionName: "convertToAssets",
      args: [R(sty.idx.rate)],
      blockNumber,
    })
  : undefined;
console.log(`(${calls.length + (sty ? 1 : 0)} reads in two multicalls)\n`);

for (const { b, g, adapter, feeds, rates, fallback, idx } of plan) {
  check(`${b.key}: grade present`, Boolean(g));
  if (!g) continue;
  console.log(`${b.symbol} — ${g.contractName} ${b.priceFeed} = ${g.formula}`);
  check(`${b.key}: priceSource() == 0 (primary)`, R(idx.priceSource) === 0);

  // The adapter in the PriceFeed's ethUsdOracle slot, and its threshold.
  const headLeg = g.legs.find((l) => l.getter === "ethUsdOracle");
  const threshold = headLeg.stalenessS ?? MAX_UINT;
  const [slot, slotStale, slotDec] = R(idx.ethUsdOracle);
  check(
    `${b.key}: ethUsdOracle = ${adapter.name}, ${headLeg.stalenessS ? hrs(threshold) : "2^256 − 1"} staleness, 8 dp`,
    eq(slot, adapter.address) && slotStale === BigInt(threshold) && slotDec === 8,
    `chain ${slot} · ${slotStale} s · ${slotDec} dp`,
  );

  // Chainlink legs: identity, published cadence, and age.
  const F = {};
  feeds.forEach((f, j) => {
    const r = idx.feeds[j];
    const desc = R(r.description);
    check(
      `  ${f.label}: description "${f.feedName}", 8 dp`,
      desc === f.feedName && R(r.decimals) === 8,
      `chain "${desc}"`,
    );
    const pub = cl?.get(f.address);
    if (pub)
      check(
        `  ${f.label}: published ${f.deviationPct}% deviation, ${hrs(f.heartbeatS)} heartbeat`,
        pub.deviationPct === f.deviationPct && pub.heartbeatS === f.heartbeatS,
        `chainlink ${pub.deviationPct}% · ${pub.heartbeatS} s`,
      );
    else if (cl) note(`  ${f.label}`, "not in Chainlink's published list");
    F[f.label] = R(r.round);
    const age = now - F[f.label][3];
    console.log(
      `  info  ${f.label}: age ${hrs(age)} (${f.stalenessS ? `counted down at ${hrs(f.stalenessS)}` : "no threshold"})`,
    );
    if (age > BigInt(f.heartbeatS)) note(`  ${f.label}: age`, `${hrs(age)} is past the ${hrs(f.heartbeatS)} heartbeat`);
  });

  // Adapter wiring.
  const getters = ADAPTER_FEED_GETTER[adapter.name] ?? {};
  const primaryLeg = feeds.find((f) => f.via?.address === adapter.address);
  if (getters.primary)
    check(
      `  ${adapter.name}.${getters.primary} = ${primaryLeg.label}`,
      eq(R(idx.adapterGetters.primary), primaryLeg.address),
    );
  if (getters.btc) {
    const btc = feeds.find((f) => f.label === "BTC/USD");
    check(`  ${adapter.name}.${getters.btc} = BTC/USD`, eq(R(idx.adapterGetters.btc), btc.address));
  }
  if (idx.adapterToken !== undefined)
    check(
      `  ${adapter.name}.TOKEN = ${rates[0].label.replace(" rate", "")}`,
      eq(R(idx.adapterToken), rates[0].address),
    );
  if (idx.adapterNonStaked !== undefined)
    check(`  ${adapter.name}.NON_STAKED_TOKEN = yBOLD`, eq(R(idx.adapterNonStaked), rates[1].address));

  // Fallback wiring and value.
  let fbAnswer = ZERO;
  if (fallback) {
    check(`  ${adapter.name}.FALLBACK_ORACLE = ${fallback.via.name}`, eq(R(idx.adapterFallback), fallback.via.address));
    check(`  ${fallback.via.name}.AGG = ${fallback.contractName}`, eq(R(idx.fallback.agg), fallback.address));
    const enabled = R(idx.fallback.enabled);
    check(`  ${fallback.via.name}: useFallback on`, enabled === true);
    check(
      `  ${fallback.via.name}: owner ${ASYMMETRY_FALLBACK_OWNER}`,
      eq(R(idx.fallback.owner), ASYMMETRY_FALLBACK_OWNER),
    );
    fbAnswer = enabled ? R(idx.fallback.price) / E10 : ZERO;
    const [, fa, , fu] = R(idx.fallback.round);
    check(`  ${fallback.via.name}: answer = Curve price() ÷ 1e10, stamped now`, fa === fbAnswer && fu === now);
    const [, pa] = F[feeds.find((f) => f.via?.address === adapter.address).label];
    const gap = adapter.name === "WbtcOracle" ? null : ((Number(fa) - Number(pa)) / Number(pa)) * 100;
    console.log(
      `  info  ${fallback.label} would answer ${Number(fa) / 1e8}${gap === null ? "" : ` (${gap.toFixed(2)}% from Chainlink)`}`,
    );
  }

  // The adapter's answer, recomputed along the path it takes at this block.
  let want;
  let path = "primary";
  const fb = () => {
    path = "Curve fallback";
    return [fbAnswer, now];
  };
  if (adapter.name === "StyBoldOracle") {
    want = [yBoldAssets, now];
  } else if (getters.primary === "PRIMARY_ORACLE") {
    const [, a, , u] = F[primaryLeg.label];
    let [ans, upd] = staleLE(now, u, a, primaryLeg.stalenessS) && fallback ? fb() : [a, u];
    want = [(ans * R(idx.rate)) / E18, upd];
  } else if (adapter.name === "TbtcOracle") {
    const [, a, , u] = F["tBTC/USD"];
    want = staleLE(now, u, a, primaryLeg.stalenessS) ? fb() : [a, u];
  } else if (adapter.name === "CbbtcOracle") {
    const [, a, , u] = F["cbBTC/USD"];
    want = staleLT(now, u, a, primaryLeg.stalenessS) ? fb() : [a, u];
  } else if (adapter.name === "WbtcOracle") {
    const [, wa, , wu] = F["WBTC/BTC"];
    const [, ba, , bu] = F["BTC/USD"];
    const btcAdapterStale = 86_400; // WbtcOracle's `_1_HOUR`, 24 h
    const zero = staleLE(now, wu, wa, primaryLeg.stalenessS) || staleLE(now, bu, ba, btcAdapterStale);
    want = zero ? fb() : [(wa * ba) / E8, wu < bu ? wu : bu];
  }
  const round = R(idx.adapterRound);
  check(
    `  ${adapter.name}: answer = graded path (${path}), BigInt-exact`,
    round[1] === want[0] && round[3] === want[1],
    `${round[1]} @ ${round[3]} vs ${want[0]} @ ${want[1]}`,
  );
  check(
    `  ${adapter.name}: age ${hrs(now - round[3])} passes the PriceFeed's threshold`,
    valid(now, round, BigInt(threshold)),
  );

  // The PriceFeed arithmetic.
  const coll = round[1] * E10;
  let price = coll;
  let redemption = coll;
  if (g.contractName === "BTCPriceFeed") {
    const btcLeg = feeds.find((f) => f.label === "BTC/USD");
    const [bslot, bstale, bdec] = R(idx.btcUsdOracle);
    check(
      `${b.key}: btcUsdOracle = BTC/USD, ${hrs(btcLeg.stalenessS)} staleness, 8 dp`,
      eq(bslot, btcLeg.address) && bstale === BigInt(btcLeg.stalenessS) && bdec === 8,
      `chain ${bslot} · ${bstale} s · ${bdec} dp`,
    );
    check(`${b.key}: redemption band DEVIATION_THRESHOLD = 2%`, R(idx.band) === BAND);
    const btcRound = F["BTC/USD"];
    if (valid(now, btcRound, BigInt(btcLeg.stalenessS))) {
      const btc = btcRound[1] * E10;
      price = min(coll, btc);
      redemption = within(coll, btc, BAND) ? max(coll, btc) : price;
    } else {
      note(
        `${b.key}: BTC/USD`,
        `past its ${hrs(btcLeg.stalenessS)} threshold; the PriceFeed prices at the collateral leg alone`,
      );
    }
  }
  const [fetched, down] = R(idx.fetchPrice);
  const [redeem] = R(idx.fetchRedemptionPrice);
  check(
    `${b.key}: fetchPrice = ${g.formula}, BigInt-exact`,
    fetched === price && !down,
    `${usd(fetched)} vs ${usd(price)}`,
  );
  check(
    `${b.key}: fetchRedemptionPrice = graded redemption rule`,
    redeem === redemption,
    `${usd(redeem)} vs ${usd(redemption)}`,
  );

  const lgp = R(idx.lastGoodPrice);
  const gap = ((Number(fetched) - Number(lgp)) / Number(lgp)) * 100;
  console.log(`  info  lastGoodPrice ${usd(lgp)} · fetchPrice ${usd(fetched)} · gap ${gap.toFixed(2)}%\n`);
}

console.log(`${pass} passed, ${fail} failed, ${warn} warnings`);
process.exit(fail > 0 ? 1 : 0);
