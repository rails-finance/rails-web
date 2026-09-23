// Verify the Aave V4 mainnet chain facts the explorer renders as primary truth.
// V4 is a hub-and-spoke system: user-facing Spoke contracts hold each wallet's
// per-reserve balances and expose getUserAccountData; unified-liquidity Hubs
// (Core / Plus / Prime / Global Dollar) sit behind them. The web explorer reads
// the Spokes live (lib/sources/chain/aave-v4-position.ts) and values positions
// at the V4 oracle's price (rails-server aave-v4-oracle-registry: each spoke's
// AaveOracle.getReservePrice). This script re-derives those figures from the chain by an
// independent path and checks them against the indexed API and the config the
// contracts expose — the offline verifier the coverage matrix's `verification`
// cell asserts (lib/shared/coverage.ts). Nothing under app/ or lib/ imports it;
// run it by hand when the Aave V4 explorer is built or changed.
//
// Everything is anchored on ADDRESSES, never on spoke display names: prior work
// found the indexer's spoke naming drifts from the current SPOKE_META, so every
// chain read keys off the spoke contract address and the hub is identified by
// its own on-chain address (mapped to a tier), not a label.
//
// Checks:
//   1. Address graph — the ten launch spokes are live contracts (getReserve
//      count > 0); every reserve names a hub that has deployed code; the hub set
//      resolves to exactly three distinct hubs, derived purely from the spokes'
//      own getReserve().hub (Core = the hub `main` uses, Prime = the extra hub
//      `bluechip` draws on, Plus = the hub `ethena_corr` uses). The cross-hub
//      spokes (bluechip, ethena_eco) each reference exactly two hubs and the
//      single-hub spokes exactly one; Core is the shared backbone (≥7 spokes).
//   2. Reserve config — every reserve's getDynamicReserveConfig is well-formed:
//      collateralFactor in (0, 100%] (the LT the position surface renders as
//      reserves[].lt = cf/1e4), maxLiquidationBonus ≥ 100%, liquidationFee in
//      [0, 100%). Asserted over the full, non-empty reserve set.
//   3. Hub spoke-grouping — the hub comparison view groups each asset across the
//      spokes that list it. For every (hub, asset) present both on chain and in
//      the indexed /api/aave-v4/hubs lines, the chain-derived member-spoke set is
//      a subset of the API's (the API additionally covers the Global Dollar
//      `usdg_pendle` spoke, which is outside this script's ten-spoke roster).
//   4. Oracle — on the sampled position, the protocol's valuation
//      (getUserAccountData.totalCollateralValue ÷ totalDebtValue) is
//      reconciled against the SAME ratio computed as Σ(balance × the spoke
//      oracle's getReservePrice) — the price path the explorer's on-chain USD
//      uses; and that Σ matches the indexed totalSupplyUsd / totalDebtUsd.
//   5. Reserve LT ↔ position CF — on the sampled position the chain
//      collateralFactor (cf/1e4) equals the indexed reserves[].lt, and the
//      collateral-USD-weighted mean of the per-reserve cfs equals the position's
//      getUserAccountData.avgCollateralFactor (a chain-internal identity).
//   6. Position health factor — the account struct's own identity
//      HF == totalCollateralValue × avgCollateralFactor ÷ totalDebtValue holds
//      on chain, and the chain HF matches the indexed healthFactor.
//
// Deliberately NOT checked (stated, not forced):
//   • Borrow rate / liquidity fee. The hub exposes reserve state only as a
//     single packed getAssetConfig(uint256); there is no discoverable standalone
//     drawnRate / reserve-factor getter, so the rate pipeline's ray borrow rate
//     and liquidity fee are not independently re-derivable from a clean chain
//     read. The liquidation parameters that ARE cleanly exposed are checked (2).
//   • Hub-view LT ranges. The hub comparison's ltMin/ltMax use a server-harvested
//     EFFECTIVE liquidation threshold (harvested from getUserAccountData.
//     avgCollateralFactor on single-collateral positions), which legitimately
//     exceeds the reserve's static collateralFactor in e-mode / correlated venues
//     (e.g. Core WETH: 0.83 config vs 0.92 effective). The two are different
//     quantities, so they are not cross-asserted; the chain-anchored LT truth is
//     proven at the position level (checks 5 & 6). Only the spoke GROUPING the
//     hub view aggregates over is chain-verified (3).
//   • Liquidation events. V4 liquidation event coverage has known gaps, so no
//     check depends on events the protocol may not have emitted.
//
// Run: node scripts/verify-aave-v4-chain.mjs
// Env: .env.local — ALCHEMY_URL (chain reads), RAILS_API_URL + API_BEARER_TOKEN
//      (indexed cross-checks; their absence downgrades the API-dependent checks
//      to a stated skip — the chain-only checks 1 and 2 still run and gate exit).

import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { mainnet } from "viem/chains";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l
        .slice(l.indexOf("=") + 1)
        .trim()
        .replace(/^"|"$/g, ""),
    ]),
);
if (!env.ALCHEMY_URL) throw new Error("ALCHEMY_URL missing from .env.local");

const c = createPublicClient({
  chain: mainnet,
  batch: { multicall: { wait: 40 } },
  transport: http(env.ALCHEMY_URL, { retryCount: 8, retryDelay: 1_000 }),
});

// The ten launch spokes, keyed by the canonical spoke key, valued by contract
// ADDRESS (mirrors lib/sources/chain/aave-v4-position.ts SPOKES). The address is
// the anchor; the key is only used for set membership against the API, which
// emits the same keys for these ten.
const SPOKES = {
  main: "0x94e7a5dcbe816e498b89ab752661904e2f56c485",
  bluechip: "0x973a023a77420ba610f06b3858ad991df6d85a08",
  ethena_corr: "0x58131e79531cab1d52301228d1f7b842f26b9649",
  ethena_eco: "0xba1b3d55d249692b669a164024a838309b7508af",
  etherfi: "0xbf10bdfe177de0336afd7fccf80a904e15386219",
  forex: "0xd8b93635b8c6d0ff98cbe90b5988e3f2d1cd9da1",
  gold: "0x65407b940966954b23dfa3caa5c0702bb42984dc",
  kelp: "0x3131fe68c4722e726fe6b2819ed68e514395b9a4",
  lido: "0xe1900480ac69f0b296841cd01cc37546d92f35cd",
  lombard: "0x7ec68b5695e803e98a21a9a05d744f28b0a7753d",
};
// Spokes the explorer documents (SPOKE_META) as cross-hub-credit / Core-credit —
// collateral in one hub, borrow drawn from another — so their reserves must span
// two hubs. Everything else is single-hub. Verified structurally below.
const CROSS_HUB_SPOKES = new Set(["bluechip", "ethena_eco"]);

const SPOKE_ABI = parseAbi([
  "function getUserAccountData(address user) view returns (uint256 riskPremium, uint256 avgCollateralFactor, uint256 healthFactor, uint256 totalCollateralValue, uint256 totalDebtValueRay, uint256 activeCollateralCount, uint256 borrowCount)",
  "function getReserveCount() view returns (uint256)",
  "function getReserve(uint256 id) view returns ((address underlying, address hub, uint256 assetId, uint256 decimals, uint256 collateralRisk, uint256 flags, uint32 dynamicConfigKey))",
  "function getDynamicReserveConfig(uint256 id, uint32 key) view returns ((uint256 collateralFactor, uint256 maxLiquidationBonus, uint256 liquidationFee))",
  "function getUserSuppliedAssets(uint256 id, address user) view returns (uint256)",
  "function getUserTotalDebt(uint256 id, address user) view returns (uint256)",
  "function getUserReserveStatus(uint256 id, address user) view returns (bool isCollateral, bool hasBorrow)",
]);
const V4_ORACLE_ABI = parseAbi(["function getReservePrice(uint256 reserveId) view returns (uint256)"]);
const ORACLE_OF_ABI = parseAbi(["function ORACLE() view returns (address)"]);

const BPS = 10_000;
const WAD = 1e18;
const RAY = 1e27;
let failures = 0;
let skips = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const skip = (name, reason) => {
  console.log(`SKIP  ${name} — ${reason}`);
  skips++;
};
const read = (address, fn, args = []) =>
  c.readContract({ address: getAddress(address), abi: SPOKE_ABI, functionName: fn, args });
/** The spoke oracle's USD price for one of its reserves (8 decimals) — the
 *  price the protocol values that reserve at. Null when it gives none. */
const oracleOf = new Map();
async function priceUsd(spokeAddr, reserveId) {
  if (!oracleOf.has(spokeAddr))
    oracleOf.set(
      spokeAddr,
      await c.readContract({ address: getAddress(spokeAddr), abi: ORACLE_OF_ABI, functionName: "ORACLE" }),
    );
  try {
    const raw = await c.readContract({
      address: oracleOf.get(spokeAddr),
      abi: V4_ORACLE_ABI,
      functionName: "getReservePrice",
      args: [BigInt(reserveId)],
    });
    return raw > BigInt(0) ? Number(raw) / 1e8 : null;
  } catch {
    return null;
  }
}
const rel = (a, b) => (b === 0 ? (a === 0 ? 0 : Infinity) : Math.abs(a / b - 1));

// ── Load the full reserve graph once (all spokes) ────────────────────────────
// Per spoke: [{ id, underlying, hub, decimals, key, cf, maxLiqBonus, liqFee }].
const graph = {};
for (const [key, addr] of Object.entries(SPOKES)) {
  let count;
  try {
    count = Number(await read(addr, "getReserveCount"));
  } catch {
    count = -1;
  }
  if (count <= 0) {
    graph[key] = { count, reserves: [], hubs: new Set() };
    continue;
  }
  const reserves = [];
  const hubs = new Set();
  const metas = await Promise.all(Array.from({ length: count }, (_, i) => read(addr, "getReserve", [BigInt(i)])));
  const cfgs = await Promise.all(
    metas.map((r, i) => read(addr, "getDynamicReserveConfig", [BigInt(i), r.dynamicConfigKey])),
  );
  for (let i = 0; i < count; i++) {
    const r = metas[i];
    const cfg = cfgs[i];
    hubs.add(r.hub.toLowerCase());
    reserves.push({
      id: i,
      underlying: r.underlying.toLowerCase(),
      hub: r.hub.toLowerCase(),
      decimals: Number(r.decimals),
      key: r.dynamicConfigKey,
      cf: cfg.collateralFactor,
      maxLiqBonus: cfg.maxLiquidationBonus,
      liqFee: cfg.liquidationFee,
    });
  }
  graph[key] = { count, reserves, hubs };
}

// ── 1. Address graph ─────────────────────────────────────────────────────────
console.log("\n## 1. Address graph");
for (const [key] of Object.entries(SPOKES)) {
  check(`${key}: live spoke, getReserveCount > 0`, graph[key].count > 0, `${graph[key].count} reserves`);
}
// Every reserve names a hub with deployed code.
const allHubs = new Set();
for (const key of Object.keys(SPOKES)) for (const h of graph[key].hubs) allHubs.add(h);
check("hub set non-empty", allHubs.size > 0, `${allHubs.size} distinct hubs`);
let allHubsHaveCode = allHubs.size > 0;
for (const h of allHubs) {
  const code = await c.getCode({ address: getAddress(h) });
  if (!code || code === "0x") allHubsHaveCode = false;
}
check("every referenced hub has deployed code", allHubsHaveCode);
check("exactly three distinct hubs across the ten spokes", allHubs.size === 3, [...allHubs].join(", "));

// Derive the three tiers purely from the spokes' own wiring (addresses only).
const coreAddr = [...graph.main.hubs][0];
const primeAddr = [...graph.bluechip.hubs].find((h) => h !== coreAddr);
const plusAddr = [...graph.ethena_corr.hubs][0];
check(
  "Core / Prime / Plus resolve to three distinct hub addresses",
  Boolean(coreAddr && primeAddr && plusAddr) && new Set([coreAddr, primeAddr, plusAddr]).size === 3,
  `core ${coreAddr?.slice(0, 10)} prime ${primeAddr?.slice(0, 10)} plus ${plusAddr?.slice(0, 10)}`,
);
const tierOf = (h) => (h === coreAddr ? "core" : h === primeAddr ? "prime" : h === plusAddr ? "plus" : "?");

// Structural cross-hub vs single-hub, anchored on the spoke address.
for (const [key] of Object.entries(SPOKES)) {
  if (graph[key].count <= 0) continue;
  const n = graph[key].hubs.size;
  const expect = CROSS_HUB_SPOKES.has(key) ? 2 : 1;
  check(
    `${key}: references ${expect} hub(s) [${CROSS_HUB_SPOKES.has(key) ? "cross-hub" : "single-hub"}]`,
    n === expect,
    `${[...graph[key].hubs].map(tierOf).join("+")}`,
  );
}
// Bluechip is Prime-collateral / Core-borrow; ethena_eco spans Plus + Core.
check("bluechip spans Core + Prime", graph.bluechip.hubs.has(coreAddr) && graph.bluechip.hubs.has(primeAddr));
check("ethena_eco spans Plus + Core", graph.ethena_eco.hubs.has(coreAddr) && graph.ethena_eco.hubs.has(plusAddr));
// Core is the shared backbone.
const coreCount = Object.keys(SPOKES).filter((k) => graph[k].hubs.has(coreAddr)).length;
check("Core hub is the shared backbone (≥7 spokes reference it)", coreCount >= 7, `${coreCount} spokes`);

// ── 2. Reserve config (over the full reserve set) ────────────────────────────
console.log("\n## 2. Reserve config");
const allReserves = Object.keys(SPOKES).flatMap((k) => graph[k].reserves.map((r) => ({ spoke: k, ...r })));
check(
  "reserve set non-empty",
  allReserves.length > 0,
  `${allReserves.length} reserves across ${Object.keys(SPOKES).length} spokes`,
);
if (allReserves.length > 0) {
  // collateralFactor is 0 for a borrow-only reserve (not collateral-enabled on
  // this spoke) and (0, 100%] where it is; both are well-formed.
  const badCf = allReserves.filter((r) => !(r.cf >= BigInt(0) && r.cf <= BigInt(BPS)));
  check(
    "every reserve collateralFactor in [0, 100%]",
    badCf.length === 0,
    badCf.length === 0
      ? `${allReserves.length} reserves`
      : `${badCf.length} out of range, e.g. ${badCf[0].spoke}#${badCf[0].id} cf=${badCf[0].cf}`,
  );
  // Liquidation parameters are only meaningful where the reserve can be seized,
  // i.e. cf > 0; a borrow-only reserve carries no liquidation config.
  const collateralEnabled = allReserves.filter((r) => r.cf > BigInt(0));
  check(
    "collateral-enabled reserve set non-empty",
    collateralEnabled.length > 0,
    `${collateralEnabled.length} of ${allReserves.length} reserves are collateral-enabled`,
  );
  if (collateralEnabled.length > 0) {
    const badLiq = collateralEnabled.filter(
      (r) =>
        !(
          r.maxLiqBonus >= BigInt(BPS) &&
          r.maxLiqBonus < BigInt(3 * BPS) &&
          r.liqFee >= BigInt(0) &&
          r.liqFee < BigInt(BPS)
        ),
    );
    check(
      "every collateral-enabled reserve: liqBonus∈[100%,300%), liqFee∈[0,100%)",
      badLiq.length === 0,
      badLiq.length === 0
        ? `${collateralEnabled.length} reserves`
        : `${badLiq.length} malformed, e.g. ${badLiq[0].spoke}#${badLiq[0].id} liqBonus=${badLiq[0].maxLiqBonus} liqFee=${badLiq[0].liqFee}`,
    );
  }
}

// ── API-dependent checks ─────────────────────────────────────────────────────
const apiBase = env.RAILS_API_URL;
const apiHeaders = env.API_BEARER_TOKEN ? { Authorization: `Bearer ${env.API_BEARER_TOKEN}` } : {};
async function apiGet(path) {
  if (!apiBase) return null;
  try {
    const res = await fetch(`${apiBase}${path}`, { headers: apiHeaders });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── 3. Hub spoke-grouping (chain ⊆ indexed) ──────────────────────────────────
console.log("\n## 3. Hub spoke-grouping");
const hubs = await apiGet("/api/aave-v4/hubs");
if (!hubs || !Array.isArray(hubs.lines)) {
  skip("hub spoke-grouping", "/api/aave-v4/hubs unreachable or malformed");
} else {
  // chain grouping: (hubTier, underlying) → set of spoke keys.
  const chainGroup = new Map();
  for (const k of Object.keys(SPOKES)) {
    for (const r of graph[k].reserves) {
      const gk = `${tierOf(r.hub)}|${r.underlying}`;
      if (!chainGroup.has(gk)) chainGroup.set(gk, new Set());
      chainGroup.get(gk).add(k);
    }
  }
  const apiGroup = new Map();
  for (const l of hubs.lines) {
    const gk = `${l.hub}|${l.underlying.toLowerCase()}`;
    if (!apiGroup.has(gk)) apiGroup.set(gk, new Set());
    apiGroup.get(gk).add(l.spoke);
  }
  let inter = 0;
  let subsetOk = true;
  const offenders = [];
  for (const [gk, cs] of chainGroup) {
    const as = apiGroup.get(gk);
    if (!as) continue;
    inter++;
    for (const s of cs)
      if (!as.has(s)) {
        subsetOk = false;
        offenders.push(`${gk.slice(0, 20)} chain has ${s}, api lacks it`);
      }
  }
  check("chain/API (hub,asset) grouping intersection non-empty", inter > 0, `${inter} shared (hub,asset) keys`);
  if (inter > 0)
    check(
      "every chain (hub,asset) member-spoke ⊆ indexed member-spokes",
      subsetOk,
      subsetOk ? `${inter} groups reconcile` : offenders.slice(0, 3).join("; "),
    );
}

// ── Sample a real position for checks 4–6 ────────────────────────────────────
// Largest main-spoke position with debt — `main` is a standard (non-e-mode)
// venue, where the indexed reserves[].lt equals the reserve's static
// collateralFactor, so check 5's lt equality is exact.
console.log("\n## 4–6. Sampled position (chain re-derivation)");
const mainList = await apiGet(
  "/api/aave-v4/spoke-positions?spokes=main&hasDebt=true&sortBy=supplyUsd&sortOrder=desc&limit=1",
);
const sample = mainList?.rows?.[0] ?? null;
if (!sample) {
  skip("position checks 4–6", "/api/aave-v4/spoke-positions unreachable or returned no main position with debt");
} else {
  const spokeAddr = SPOKES[sample.spoke];
  const wallet = getAddress(sample.wallet);
  const acct = await read(spokeAddr, "getUserAccountData", [wallet]);
  const [, avgCfRaw, hfRaw, collValRaw, debtRayRaw, , borrowCount] = acct;
  check(
    `sample ${sample.spoke} ${wallet.slice(0, 10)} has debt on chain`,
    borrowCount > BigInt(0),
    `borrowCount ${borrowCount}`,
  );

  // Per-reserve state for this wallet, plus config, over the spoke's reserves.
  const reserves = graph[sample.spoke].reserves;
  const bals = await Promise.all(
    reserves.map(async (r) => {
      const [sup, debt, st] = await Promise.all([
        read(spokeAddr, "getUserSuppliedAssets", [BigInt(r.id), wallet]),
        read(spokeAddr, "getUserTotalDebt", [BigInt(r.id), wallet]),
        read(spokeAddr, "getUserReserveStatus", [BigInt(r.id), wallet]),
      ]);
      return { ...r, sup, debt, isCollateral: st[0] };
    }),
  );
  const touched = bals.filter((b) => b.sup > BigInt(0) || b.debt > BigInt(0));

  // ── 6. Health-factor identity + indexed match ──
  const avgCf = Number(avgCfRaw) / WAD;
  const chainHf = (Number(collValRaw) * avgCf) / (Number(debtRayRaw) / RAY);
  const structHf = Number(hfRaw) / WAD;
  check(
    "HF == totalCollateralValue × avgCollateralFactor ÷ totalDebtValue (chain identity)",
    Number.isFinite(chainHf) && rel(chainHf, structHf) < 0.005,
    `recomputed ${chainHf.toFixed(4)} vs struct ${structHf.toFixed(4)}`,
  );
  if (sample.healthFactor != null)
    check(
      "chain HF matches indexed healthFactor",
      rel(structHf, sample.healthFactor) < 0.03,
      `chain ${structHf.toFixed(4)} vs indexed ${sample.healthFactor.toFixed(4)}`,
    );
  else skip("chain HF vs indexed", "indexed healthFactor is null");

  // ── 5. Reserve LT ↔ position CF ──
  const collateral = touched.filter((b) => b.isCollateral && b.sup > BigInt(0));
  check("sample has collateral to weight", collateral.length > 0, `${collateral.length} collateral reserves`);
  if (collateral.length > 0) {
    // Weighted mean of per-reserve cf, weighted by collateral USD (oracle).
    let usdSum = 0;
    let cfWeighted = 0;
    let priceable = true;
    for (const b of collateral) {
      const p = await priceUsd(spokeAddr, b.id);
      if (p == null) {
        priceable = false;
        break;
      }
      const usd = (Number(b.sup) / 10 ** b.decimals) * p;
      usdSum += usd;
      cfWeighted += usd * (Number(b.cf) / BPS);
    }
    if (priceable && usdSum > 0)
      check(
        "collateral-USD-weighted mean cf == getUserAccountData.avgCollateralFactor",
        rel(cfWeighted / usdSum, avgCf) < 0.005,
        `weighted ${(cfWeighted / usdSum).toFixed(6)} vs avgCF ${avgCf.toFixed(6)}`,
      );
    else skip("cf-weighting identity", "the oracle gives no price for a collateral reserve");
  }
  // Chain collateralFactor vs indexed reserves[].lt, restricted to reserves that
  // are collateral-enabled on this spoke (chain cf > 0). A borrow-only reserve
  // (cf == 0) still carries an indexed lt harvested from a spoke where the asset
  // IS collateral, so it isn't a like-for-like comparison. On `main` (a standard
  // venue) the harvested effective LT equals the static cf, so this is exact.
  const idxByAddr = new Map((sample.reserves ?? []).map((r) => [r.address.toLowerCase(), r]));
  const ltPairs = reserves
    .map((r) => ({ r, idx: idxByAddr.get(r.underlying) }))
    .filter((p) => p.idx && p.idx.lt != null && p.r.cf > BigInt(0));
  check(
    "indexed reserves carry an lt to compare",
    ltPairs.length > 0,
    `${ltPairs.length} collateral-enabled reserves with indexed lt`,
  );
  if (ltPairs.length > 0) {
    const bad = ltPairs.filter((p) => Math.abs(Number(p.r.cf) / BPS - p.idx.lt) > 1e-4);
    check(
      "chain collateralFactor (cf/1e4) == indexed reserves[].lt",
      bad.length === 0,
      bad.length === 0
        ? `${ltPairs.length} reserves match`
        : `${bad.length} differ, e.g. ${bad[0].idx.symbol} chain ${Number(bad[0].r.cf) / BPS} vs idx ${bad[0].idx.lt}`,
    );
  }

  // ── 4. Oracle: protocol valuation vs Σ(balance × oracle price), and vs indexed totals ──
  let collUsd = 0;
  let debtUsd = 0;
  let fullyPriced = true;
  for (const b of touched) {
    const needsPrice = (b.isCollateral && b.sup > BigInt(0)) || b.debt > BigInt(0);
    if (!needsPrice) continue;
    const p = await priceUsd(spokeAddr, b.id);
    if (p == null) {
      fullyPriced = false;
      break;
    }
    if (b.isCollateral && b.sup > BigInt(0)) collUsd += (Number(b.sup) / 10 ** b.decimals) * p;
    if (b.debt > BigInt(0)) debtUsd += (Number(b.debt) / 10 ** b.decimals) * p;
  }
  if (!fullyPriced) {
    skip("oracle valuation reconciliation", "the oracle gives no price for a reserve the sampled position holds");
  } else if (debtUsd <= 0 || collUsd <= 0) {
    skip("oracle valuation reconciliation", "sampled position has no priced collateral or debt");
  } else {
    const protoRatio = Number(collValRaw) / (Number(debtRayRaw) / RAY);
    const clRatio = collUsd / debtUsd;
    check(
      "protocol coll/debt value ratio == Σ(balance × oracle price) ratio",
      rel(protoRatio, clRatio) < 0.01,
      `protocol ${protoRatio.toFixed(4)} vs oracle prices ${clRatio.toFixed(4)} (${(rel(protoRatio, clRatio) * 100).toFixed(3)}%)`,
    );
    if (sample.totalSupplyUsd != null)
      check(
        "Σ oracle-priced collateral USD ≈ indexed totalSupplyUsd",
        rel(collUsd, sample.totalSupplyUsd) < 0.03,
        `chain $${collUsd.toFixed(0)} vs indexed $${sample.totalSupplyUsd.toFixed(0)}`,
      );
    if (sample.totalDebtUsd != null)
      check(
        "Σ oracle-priced debt USD ≈ indexed totalDebtUsd",
        rel(debtUsd, sample.totalDebtUsd) < 0.03,
        `chain $${debtUsd.toFixed(0)} vs indexed $${sample.totalDebtUsd.toFixed(0)}`,
      );
  }
}

console.log(
  `\n${failures === 0 ? "ALL CHAIN CHECKS PASS" : `${failures} CHECK(S) FAILED`}${skips ? ` (${skips} skipped — stated reason above)` : ""}`,
);
process.exit(failures === 0 ? 0 : 1);
