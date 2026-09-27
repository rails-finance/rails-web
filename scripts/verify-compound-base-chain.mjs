// ============================================================================
// VERIFY: Compound V3 (Comet) on BASE (chain 8453) — the five Comets' own
// state, a deployer check, AND the explorer's served figures
// ============================================================================
//
// A Comet is not an Aave Pool (one proxy per market, no shared registry), so
// the V3-fork core (scripts/lib/aave-v3-fork-verify-core.mjs) does not serve
// it, as it does not serve Ethereum's own Compound V3
// (scripts/verify-compound-v3-chain.mjs) — checks 1-6 below are that script's
// checks, pointed at Base's five markets.
//
// THE DEPLOYER CHECK (lib/compound-base/asset-catalog.ts's whole point): a
// Comet's own name is not proof of identity. Whole-life, EIGHT distinct
// proxies on Base have been deployed through `CometDeployed`, and FOUR of
// them answer `symbol()` == "cUSDCv3" — only five are Compound's, resolved by
// the catalog's own one-time census against the `CometDeployed` log (a sweep
// this script does not repeat: BASE_RPC_URL's eth_getLogs answers ten blocks
// at a time, so no whole-life log census can run here). What this script DOES
// reproduce, live, every run: each of the five pinned Comets answers
// `governor()` == Compound governance's Base bridge receiver — the fact that
// makes them Compound's, re-checked rather than assumed.
//
// What is NEW here (the Ethereum script never needed it):
//   • Samples are drawn BY QUERY from the live index
//     (rails-server's /api/compound-base/positions) — the heaviest debt, a
//     closed account, a liquidated one — never hard-coded wallets.
//   • Check 7 reads what the EXPLORER ITSELF serves for each sampled
//     (market, account) — GET /api/compound-base/positions?wallet=&market=,
//     fetched from BOTH production (rails.finance) and preview
//     (dev.rails.finance, the Vercel bypass header) — and checks its base
//     balance and per-asset collateral raw figures against a live
//     balanceOf/borrowBalanceOf/collateralBalanceOf read at the SAME block
//     the row names (`current.block`).
//
// Checks 1-6 (each Comet's own contract state):
//   1. Deployer identity — governor() == the pinned Base bridge receiver, for
//      all five Comets; baseToken/baseScale match the catalog.
//   2. Asset enumeration — numAssets + getAssetInfo(i): offset ordinal, scale
//      == 10^decimals, BCF <= LCF <= 1 for every collateral asset (BCF 0 =
//      governance-deprecated borrowing against it, still liquidation-eligible).
//   3. Price numeraire — getPrice(baseTokenPriceFeed) in the market's OWN
//      quote unit (lib/compound-base/asset-catalog.ts's `quoteUnit`: USD for
//      four markets, ETH for cWETHv3); a stablecoin/self-quoted base bands
//      near 1.0, a non-stable base (AERO) just prices positive and finite.
//   4. Rates — getSupplyRate/getBorrowRate(getUtilization) per-second
//      1e18-scaled; utilization == totalBorrow/totalSupply.
//   5. Account state — at most one of balanceOf/borrowBalanceOf nonzero;
//      collateralBalanceOf == userCollateral.balance; computed health
//      (SUM(coll x price x LCF)/debt) agrees with isLiquidatable /
//      isBorrowCollateralized (the contract's own verdicts).
//   6. Index agreement — event-replay collateral wei-exact vs chain, where a
//      backend row is available.
//
// Run:  node scripts/verify-compound-base-chain.mjs
//       BASE=https://dev.rails.finance node scripts/verify-compound-base-chain.mjs
// Env:  .env.local — BASE_RPC_URL (chain); RAILS_API_URL + API_BEARER_TOKEN
//       (sampling + check 6; degrades with a stated reason if absent);
//       VERCEL_AUTOMATION_BYPASS_SECRET (check 7's preview leg).

import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { base } from "viem/chains";
import { loadEnv } from "./lib/aave-v3-fork-verify-core.mjs";
import { hostFetch } from "./verify/lib/host.mjs";

const env = loadEnv(import.meta.url, "BASE_RPC_URL");

// lib/compound-base/asset-catalog.ts — the five Compound-governed Comets.
const GOVERNOR = getAddress("0xCC3E7c85Bb0EE4f09380e041fee95a0caeDD4a02");
const MARKETS = [
  {
    key: "usdc",
    comet: "0xb125e6687d4313864e53df431d5425969c15eb2f",
    baseToken: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    baseDecimals: 6,
    quoteUnit: "USD",
  },
  {
    key: "weth",
    comet: "0x46e6b214b524310239732d51387075e0e70970bf",
    baseToken: "0x4200000000000000000000000000000000000006",
    baseDecimals: 18,
    quoteUnit: "ETH",
  },
  {
    key: "usds",
    comet: "0x2c776041ccfe903071af44aa147368a9c8eea518",
    baseToken: "0x820c137fa70c8691f0e44dc420a5e53c168921dc",
    baseDecimals: 18,
    quoteUnit: "USD",
  },
  {
    key: "aero",
    comet: "0x784efeb622244d2348d4f2522f8860b96fbece89",
    baseToken: "0x940181a94a35a4569e4529a3cdfb74e38fd98631",
    baseDecimals: 18,
    quoteUnit: "USD",
  },
  {
    key: "usdbc",
    comet: "0x9c4ec768c28520b50860ea7a15bd7213a9ff58bf",
    baseToken: "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca",
    baseDecimals: 6,
    quoteUnit: "USD",
  },
].map((m) => ({ ...m, comet: getAddress(m.comet), baseToken: getAddress(m.baseToken) }));

const PROD_ORIGIN = "https://rails.finance";
const PREVIEW_ORIGIN = process.env.BASE ?? "https://dev.rails.finance";

const client = createPublicClient({
  chain: base,
  batch: { multicall: { wait: 50 } },
  transport: http(env.BASE_RPC_URL, { retryCount: 8, retryDelay: 1_000 }),
});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const cometAbi = parseAbi([
  "function governor() view returns (address)",
  "function baseToken() view returns (address)",
  "function baseScale() view returns (uint64)",
  "function baseTokenPriceFeed() view returns (address)",
  "function numAssets() view returns (uint8)",
  "function getAssetInfo(uint8 i) view returns ((uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))",
  "function getPrice(address priceFeed) view returns (uint256)",
  "function getUtilization() view returns (uint256)",
  "function getSupplyRate(uint256 utilization) view returns (uint64)",
  "function getBorrowRate(uint256 utilization) view returns (uint64)",
  "function totalSupply() view returns (uint256)",
  "function totalBorrow() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function borrowBalanceOf(address account) view returns (uint256)",
  "function collateralBalanceOf(address account, address asset) view returns (uint128)",
  "function userCollateral(address account, address asset) view returns (uint128 balance, uint128 _reserved)",
  "function isBorrowCollateralized(address account) view returns (bool)",
  "function isLiquidatable(address account) view returns (bool)",
]);
const erc20Abi = parseAbi(["function decimals() view returns (uint8)", "function symbol() view returns (string)"]);

const SECONDS_PER_YEAR = 31_536_000;
const FACTOR = 1e18;
const PRICE = 1e8;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

// ── Samples, BY QUERY, never hard-coded wallets ─────────────────────────────
async function queryPositions(qs) {
  if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) return [];
  const res = await fetch(`${env.RAILS_API_URL}/api/compound-base/positions?${qs}`, {
    headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.rows ?? [];
}
async function apiPositions(wallet) {
  if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) return null;
  const res = await fetch(`${env.RAILS_API_URL}/api/compound-base/positions?wallet=${wallet}&limit=10`, {
    headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.rows ?? null;
}

let samples = [];
if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) {
  console.log("SKIP sampling — RAILS_API_URL / API_BEARER_TOKEN not set; chain-only market checks still run.");
} else {
  const [heaviest, closed, liquidated] = await Promise.all([
    queryPositions("hasDebt=true&sortBy=debt&sortOrder=desc&limit=3"),
    queryPositions("status=closed&sortBy=recent&sortOrder=desc&limit=2"),
    queryPositions("status=liquidated&sortBy=recent&sortOrder=desc&limit=2"),
  ]);
  const seen = new Set();
  for (const [label, rows] of [
    ["heaviest debt", heaviest],
    ["closed", closed],
    ["liquidated", liquidated],
  ]) {
    for (const r of rows) {
      const key = `${r.market}|${r.account}`;
      if (seen.has(key)) continue;
      seen.add(key);
      samples.push({ market: r.market, account: getAddress(r.account), label });
    }
  }
}
check("indexed API returned account samples", samples.length > 0, `${samples.length} sampled`);
samples.forEach((s) => console.log(`      · ${s.label}: ${s.market}/${s.account.slice(0, 8)}…`));

async function verifyMarket(m) {
  console.log(`\n== Market ${m.key} (${m.comet}) ==`);
  const at = (functionName, args = []) => client.readContract({ address: m.comet, abi: cometAbi, functionName, args });

  const [gov, baseToken, baseScale, baseFeed, numAssets, utilization, totalSupply, totalBorrow] = await Promise.all([
    at("governor"),
    at("baseToken"),
    at("baseScale"),
    at("baseTokenPriceFeed"),
    at("numAssets"),
    at("getUtilization"),
    at("totalSupply"),
    at("totalBorrow"),
  ]);

  check(
    `${m.key}: governor() == Compound's Base bridge receiver (deployer check)`,
    gov.toLowerCase() === GOVERNOR.toLowerCase(),
    gov,
  );
  check(`${m.key}: baseToken matches catalog`, baseToken.toLowerCase() === m.baseToken.toLowerCase(), baseToken);
  check(
    `${m.key}: baseScale == 10^baseDecimals`,
    baseScale === BigInt("1" + "0".repeat(m.baseDecimals)),
    baseScale.toString(),
  );

  const basePrice = Number(await at("getPrice", [baseFeed])) / PRICE;
  const stableOrSelf = m.quoteUnit === "ETH" || m.key !== "aero";
  check(
    `${m.key}: base price plausible in its own quote unit (${m.quoteUnit})`,
    stableOrSelf ? Math.abs(basePrice - 1) < 0.02 : basePrice > 0 && basePrice < 1e6,
    `$${basePrice}`,
  );

  const [supplyRate, borrowRate] = await Promise.all([
    at("getSupplyRate", [utilization]),
    at("getBorrowRate", [utilization]),
  ]);
  const supplyApr = (Number(supplyRate) * SECONDS_PER_YEAR) / FACTOR;
  const borrowApr = (Number(borrowRate) * SECONDS_PER_YEAR) / FACTOR;
  const utilFrac = Number(utilization) / FACTOR;
  const utilFromTotals = totalSupply > 0n ? Number(totalBorrow) / Number(totalSupply) : 0;
  check(
    `${m.key}: rates sane (supply <= borrow, both in [0, 50%))`,
    supplyApr >= 0 && borrowApr >= supplyApr && borrowApr < 0.5,
    `supply ${(supplyApr * 100).toFixed(2)}% / borrow ${(borrowApr * 100).toFixed(2)}% @ util ${(utilFrac * 100).toFixed(1)}%`,
  );
  check(
    `${m.key}: getUtilization == totalBorrow/totalSupply`,
    Math.abs(utilFrac - utilFromTotals) < 0.005,
    `${utilFrac.toFixed(4)} vs ${utilFromTotals.toFixed(4)}`,
  );

  const infos = await Promise.all(Array.from({ length: Number(numAssets) }, (_, i) => at("getAssetInfo", [i])));
  const metas = await Promise.all(
    infos.map((a) =>
      Promise.all([
        client.readContract({ address: a.asset, abi: erc20Abi, functionName: "symbol" }).catch(() => "?"),
        client.readContract({ address: a.asset, abi: erc20Abi, functionName: "decimals" }),
      ]),
    ),
  );
  let enumOk = true;
  let factorsOk = true;
  infos.forEach((a, i) => {
    const [symbol, decimals] = metas[i];
    if (a.offset !== i || a.scale !== BigInt("1" + "0".repeat(decimals))) enumOk = false;
    const bcf = Number(a.borrowCollateralFactor) / FACTOR;
    const lcf = Number(a.liquidateCollateralFactor) / FACTOR;
    const lf = Number(a.liquidationFactor) / FACTOR;
    if (!(bcf <= lcf && lcf <= 1 && lf <= 1)) factorsOk = false;
    console.log(
      `      asset[${i}] ${symbol}: BCF ${bcf} / LCF ${lcf} / liqFactor ${lf}${bcf === 0 ? " [borrowing deprecated]" : ""}`,
    );
  });
  check(`${m.key}: getAssetInfo offsets ordinal + scale == 10^decimals`, enumOk, `${infos.length} assets`);
  check(`${m.key}: BCF <= LCF <= 1 and liquidationFactor <= 1 for all assets`, factorsOk);

  return { infos, metas, baseFeed, baseScale };
}

async function verifyAccount(sample, marketCtx) {
  const m = MARKETS.find((x) => x.key === sample.market);
  if (!m) {
    check(`${sample.market}: recognised market`, false, `unknown market key`);
    return;
  }
  const { infos, metas, baseFeed } = marketCtx[sample.market];
  const account = sample.account;
  console.log(`\n== Account ${sample.account} in ${sample.market} (${sample.label}) ==`);
  const at = (functionName, args) => client.readContract({ address: m.comet, abi: cometAbi, functionName, args });

  const [supply, borrow, collateralized, liquidatable, basePriceRaw] = await Promise.all([
    at("balanceOf", [account]),
    at("borrowBalanceOf", [account]),
    at("isBorrowCollateralized", [account]),
    at("isLiquidatable", [account]),
    at("getPrice", [baseFeed]),
  ]);
  check(
    `${sample.market}/${account.slice(0, 8)}: at most one of balanceOf/borrowBalanceOf nonzero`,
    supply === 0n || borrow === 0n,
    `supply ${supply} / borrow ${borrow}`,
  );

  const perAsset = await Promise.all(
    infos.map((a) =>
      Promise.all([
        at("collateralBalanceOf", [account, a.asset]),
        at("userCollateral", [account, a.asset]),
        at("getPrice", [a.priceFeed]),
      ]),
    ),
  );
  let mirrorOk = true;
  let liqCapacity = 0;
  let borrowCapacity = 0;
  perAsset.forEach(([bal, uc, priceRaw], i) => {
    if (bal !== uc[0]) mirrorOk = false;
    const a = infos[i];
    const units = Number(bal) / Number(a.scale);
    const price = Number(priceRaw) / PRICE;
    liqCapacity += units * price * (Number(a.liquidateCollateralFactor) / FACTOR);
    borrowCapacity += units * price * (Number(a.borrowCollateralFactor) / FACTOR);
    if (bal > 0n) console.log(`      ${metas[i][0]}: ${units} @ ${price}`);
  });
  check(`${sample.market}/${account.slice(0, 8)}: collateralBalanceOf == userCollateral.balance`, mirrorOk);

  const baseScale = Number(marketCtx[sample.market].baseScale);
  const debtValue = (Number(borrow) / baseScale) * (Number(basePriceRaw) / PRICE);
  if (borrow > 0n) {
    const hf = liqCapacity / debtValue;
    check(
      `${sample.market}/${account.slice(0, 8)}: computed health agrees with isLiquidatable`,
      liquidatable === hf < 1,
      `HF ${hf.toFixed(4)}, isLiquidatable ${liquidatable}`,
    );
    check(
      `${sample.market}/${account.slice(0, 8)}: borrow capacity agrees with isBorrowCollateralized`,
      collateralized === borrowCapacity >= debtValue,
      `capacity ${borrowCapacity.toFixed(2)} vs debt ${debtValue.toFixed(2)}`,
    );
  } else if (sample.label !== "closed" && sample.label !== "liquidated") {
    check(
      `${sample.market}/${account.slice(0, 8)}: no debt -> collateralized, not liquidatable`,
      collateralized && !liquidatable,
    );
  }

  const rows = await apiPositions(sample.account);
  const row = rows?.find((r) => r.market === sample.market);
  if (row?.collateral?.length) {
    const byAddr = new Map(perAsset.map(([bal], i) => [infos[i].asset.toLowerCase(), bal]));
    const replayExact = row.collateral.every((c) => byAddr.get(c.asset) === BigInt(c.amountRaw));
    check(
      `${sample.market}/${account.slice(0, 8)}: event-replay collateral wei-exact vs chain`,
      replayExact,
      row.collateral.map((c) => c.amountRaw).join(", "),
    );
  } else {
    console.log("      (no backend collateral row — index check skipped)");
  }
}

for (const m of MARKETS) {
  const ctx = await verifyMarket(m);
  MARKETS.find((x) => x.key === m.key).ctx = ctx;
  await pause(1_000);
}
const marketCtx = Object.fromEntries(MARKETS.map((m) => [m.key, m.ctx]));

for (const s of samples) {
  await verifyAccount(s, marketCtx);
  await pause(1_000);
}

// ── 7. The explorer's own served figures — production AND preview ──────────
console.log(`\n## 7. Explorer-served position vs chain, at the row's own block (production + preview)`);
async function checkOrigin(origin, s) {
  let res, json;
  try {
    res = await hostFetch(`${origin}/api/compound-base/positions?wallet=${s.account}&market=${s.market}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } catch (e) {
    check(`${origin}: ${s.label} row reachable`, false, e.message);
    return;
  }
  const row = json.data?.[0];
  if (!row) {
    check(`${origin}: ${s.label} row present`, false, "no row");
    return;
  }
  const block = row.current?.block;
  if (block == null) {
    check(`${origin}: ${s.label} row names a block`, false, "no current.block");
    return;
  }
  const m = MARKETS.find((x) => x.key === s.market);
  const [chainBal, chainBorrow] = await Promise.all([
    client.readContract({
      address: m.comet,
      abi: cometAbi,
      functionName: "balanceOf",
      args: [s.account],
      blockNumber: BigInt(block),
    }),
    client.readContract({
      address: m.comet,
      abi: cometAbi,
      functionName: "borrowBalanceOf",
      args: [s.account],
      blockNumber: BigInt(block),
    }),
  ]);
  const chainSigned = chainBal - chainBorrow;
  check(
    `${origin}: served base (signed) == chain balanceOf-borrowBalanceOf @${block}`,
    chainSigned === BigInt(row.current.amountRaw),
    `served=${row.current.amountRaw} chain=${chainSigned}`,
  );
  const collRows = row.collateral ?? [];
  if (collRows.length) {
    const chainColl = await client.multicall({
      allowFailure: true,
      blockNumber: BigInt(block),
      contracts: collRows.map((c) => ({
        address: m.comet,
        abi: cometAbi,
        functionName: "collateralBalanceOf",
        args: [s.account, getAddress(c.address)],
      })),
    });
    let collOk = true;
    collRows.forEach((c, i) => {
      const r = chainColl[i];
      if (!r || r.status !== "success" || r.result !== BigInt(c.amountRaw)) collOk = false;
    });
    check(`${origin}: served collateral wei-exact vs chain @${block}`, collOk, `${collRows.length} asset(s)`);
  }
}
for (const s of samples.slice(0, 4)) {
  await checkOrigin(PROD_ORIGIN, s);
  await checkOrigin(PREVIEW_ORIGIN, s);
  await pause(500);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
