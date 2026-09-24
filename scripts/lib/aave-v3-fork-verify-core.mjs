// Shared verification core for Aave V3 and its forks (SparkLend, Aave V3 Base,
// Seamless). One reader serves any V3-fork Pool + IAaveOracle +
// PoolAddressesProvider graph, so the checks below are written once here and
// driven by each protocol's own entry script (scripts/verify-aave-v3-chain.mjs,
// verify-spark-chain.mjs, verify-aave-v3-base-chain.mjs,
// verify-seamless-chain.mjs), which supplies its own pinned addresses and
// catalog. Keeping the addresses in the entry scripts — not here — means a red
// Spark can never hide behind a green V3: each script exits on its OWN failure
// count.
//
// THE DEPLOYMENT IS A PARAMETER. The chain, the RPC URL and the .env.local key
// that URL comes from are all supplied by the caller (`chain`, `rpcKey`); there
// is no default, because a default is what pinned every verifier in this repo
// to Ethereum mainnet. `loadEnv(metaUrl, rpcKey)` takes the same key, so a Base
// caller does not throw on a missing ALCHEMY_URL before its client is built.
//
// The architecture (identical for both): a single cross-collateralised `Pool`
// per wallet, reserves keyed by underlying token address, priced through one
// IAaveOracle, configured via a PoolAddressesProvider registry. A wallet's whole
// account (health factor, liquidation threshold, oracle-priced USD totals) is one
// Pool.getUserAccountData call; per-reserve state is Pool.getReserveData →
// aToken/variableDebtToken. This is the second data path the explorer's figures
// are re-derived from and checked against.
//
// Checks (run() below):
//   1. Address graph — Pool.ADDRESSES_PROVIDER resolves the provider; the
//      provider names the Pool, the oracle and the data-provider; the oracle and
//      data-provider both point back to the same provider (cross-checked both
//      directions). Spark also pins the provider address; V3 derives it.
//   2. Constants — every reserve's configuration bitmask decodes to an internally
//      consistent (LTV ≤ LT ≤ 1, bonus ≥ 1 when collateral-enabled, on-chain
//      decimals == the token's ERC20 decimals) risk parameter set — the LT the
//      detail reader actually renders (it reads getConfiguration live). The
//      curated catalog LTs are then cross-checked against chain: where the
//      catalog is authoritative (Spark and Aave V3 — both freshly re-verified,
//      matching to the bp) every asset is a hard equality check that fails the
//      run on drift; the audited-not-gated posture remains available
//      (catalogAuthoritative: false) for a fork whose catalog is a documented
//      stale fallback the chain read supersedes, should one ever need it.
//      A deployment whose explorer publishes NO liquidation-threshold table
//      (the Base lanes — lib/aave-v3-base and lib/seamless decode every risk
//      parameter from each reserve's own configuration word) passes
//      `catalog: null`: 2a is then the whole of check 2, the absence is stated
//      on the run rather than gated, and the asset set checks 2b and 3 speak
//      about is the Pool's own reserve list with symbols read from its ERC20s.
//   3. Price — oracle BASE_CURRENCY_UNIT == 1e8; getAssetPrice answers non-zero
//      for the reserves, the stablecoins price within a band of $1 and the ETH/BTC
//      collaterals above a sane floor. The USD the explorer shows rides this oracle.
//   4. Per-reserve state — liquidity and borrow indexes are ≥ 1 RAY (monotone from
//      genesis), and available liquidity is never negative: aToken totalSupply ≥
//      variable + stable debt totalSupply (the exact reserve identity). The
//      aToken-underlying reconciliation is REPORTED, not asserted — virtual
//      accounting and accruedToTreasury make it inexact between accrual points.
//   5. Rates — each reserve's live currentVariableBorrowRate sits within its
//      interest-rate strategy's own [base, max] bounds, base+slope1+slope2 == max
//      (the strategy's parameter identity), and the supply rate never exceeds the
//      borrow rate. V3 reads a shared strategy with asset-arg getters; Spark reads
//      per-reserve strategies with no-arg getters (strategyMode selects which).
//   6. Position sample — real borrowing wallets sampled from the indexed API,
//      re-read via Pool.getUserAccountData at head: the reported health factor
//      equals collateral × liqThreshold ÷ debt (Aave's own account identity), and
//      the reported USD totals are reconstructed from the per-reserve
//      balanceOf × oracle price along the user's own collateral/debt bitmap (the
//      independent second path). Skipped with a stated reason if the API is
//      unreachable; the chain-only checks (1–5) still run.
//   7. Timeline against the chain (only when `timeline` is configured — the
//      Base lanes). A Base listing row is already a chain read at a pinned
//      block, so checking it against the chain proves nothing. The timeline is
//      the surface that CAN disagree, and two things are asked of it:
//      7a. Every row the page draws is a log the Pool emitted — the newest
//          owner-signed rows are matched against the Pool's own logs at their
//          own block, same transaction, same reserve, same amount. One block per
//          getLogs call, which is the only range BASE_RPC_URL will answer.
//      7b. The chain's debt stands at or above the principal the replay states.
//          The running balance a row carries is a PRINCIPAL-FLOW sum — Σ ±amount
//          across the logs — and the receipt says so (lib/aave-v3/event-provenance.ts:
//          "it counts the amounts the logs carry, so the interest … is missing
//          from it"). It is not a reconstruction of balanceOf and equality is
//          not a claim the product makes. Every subtraction the debt replay
//          makes is a logged one, so the chain can only stand above it, by the
//          interest. The supply leg has no such direction — a repayment made
//          with aTokens never comes off the replay — so its gap is REPORTED.
//
// Not checked anywhere here: liquidation-bonus exactness, per-reserve accrued
// interest, and the aToken-underlying reconciliation (reported in 4, never
// asserted — virtual accounting and accruedToTreasury make it inexact between
// accrual points).

import { createPublicClient, decodeEventLog, http, parseAbi, getAddress } from "viem";
import { readFileSync } from "node:fs";
import { hostFetch } from "../verify/lib/host.mjs";

// ── env (.env.local) ─────────────────────────────────────────────────────────
// metaUrl is the ENTRY script's import.meta.url (in scripts/), so .env.local is
// one level up at the repo root — the same "../.env.local" the sibling verifiers
// use. `rpcKey` is the key THIS deployment's RPC URL lives under, so the
// precondition that throws here is the one the client will actually read.
export function loadEnv(metaUrl, rpcKey) {
  const env = Object.fromEntries(
    readFileSync(new URL("../.env.local", metaUrl), "utf8")
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
  if (!rpcKey) throw new Error("loadEnv needs the RPC env key this deployment reads (ALCHEMY_URL, BASE_RPC_URL, …)");
  if (!env[rpcKey]) throw new Error(`${rpcKey} missing from .env.local`);
  return env;
}

// ── ABIs ─────────────────────────────────────────────────────────────────────
const POOL_ABI = parseAbi([
  "function ADDRESSES_PROVIDER() view returns (address)",
  "function getReservesList() view returns (address[])",
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getUserConfiguration(address user) view returns (uint256 data)",
  "function getReserveData(address asset) view returns ((uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
]);
const PROVIDER_ABI = parseAbi([
  "function getPool() view returns (address)",
  "function getPriceOracle() view returns (address)",
  "function getPoolDataProvider() view returns (address)",
]);
const ORACLE_ABI = parseAbi([
  "function ADDRESSES_PROVIDER() view returns (address)",
  "function BASE_CURRENCY() view returns (address)",
  "function BASE_CURRENCY_UNIT() view returns (uint256)",
  "function getAssetPrice(address asset) view returns (uint256)",
]);
const DP_ABI = parseAbi(["function ADDRESSES_PROVIDER() view returns (address)"]);
const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);
// Check 7a decodes the Pool's own logs at one block. The four owner-signed
// actions only: a transfer row is the aToken's log, not the Pool's, and a
// liquidation moves two reserves in one log.
const POOL_EVENTS_ABI = parseAbi([
  "event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)",
  "event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)",
  "event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)",
  "event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)",
]);
const STRAT_ASSET_ABI = parseAbi([
  "function getBaseVariableBorrowRate(address) view returns (uint256)",
  "function getVariableRateSlope1(address) view returns (uint256)",
  "function getVariableRateSlope2(address) view returns (uint256)",
  "function getMaxVariableBorrowRate(address) view returns (uint256)",
]);
const STRAT_NOARG_ABI = parseAbi([
  "function getBaseVariableBorrowRate() view returns (uint256)",
  "function getVariableRateSlope1() view returns (uint256)",
  "function getVariableRateSlope2() view returns (uint256)",
  "function getMaxVariableBorrowRate() view returns (uint256)",
]);

const RAY = 10n ** 27n;
const BASE_UNIT = 100_000_000n; // 8-decimal USD base currency
const BPS = 10_000n;
const BPSN = 10_000; // basis-point full scale as a Number (config-consistency math)
const WAD = 10n ** 18n;
const eq = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const rayPct = (x) => (Number(x) / Number(RAY)) * 100;

// Config bitmask (Aave V3 ReserveConfiguration): LTV 0-15, LT 16-31, bonus 32-47,
// decimals 48-55, reserveFactor 64-79 — all bps except decimals.
function decodeConfig(cfg) {
  return {
    ltvBps: Number(cfg & 0xffffn),
    ltBps: Number((cfg >> 16n) & 0xffffn),
    bonusBps: Number((cfg >> 32n) & 0xffffn),
    decimals: Number((cfg >> 48n) & 0xffn),
    reserveFactorBps: Number((cfg >> 64n) & 0xffffn),
  };
}

/**
 * Run the check suite for one V3-fork deployment.
 *
 * @param {object} cfg
 * @param {string}  cfg.label            — "Aave V3" / "SparkLend" / "Seamless"
 * @param {object}  cfg.chain            — viem chain (mainnet / base). No default.
 * @param {string}  cfg.rpcKey           — .env.local key holding that chain's RPC
 *                                          URL ("ALCHEMY_URL" / "BASE_RPC_URL")
 * @param {string}  cfg.pool             — Pool (proxy) address
 * @param {string}  cfg.oracle           — IAaveOracle address (the catalog's)
 * @param {string} [cfg.provider]        — pinned PoolAddressesProvider (asserted
 *                                          equal to the one Pool derives) or omit
 * @param {?Array<{symbol,address,lt}>} cfg.catalog — the explorer's asset catalog,
 *                                          or null where it publishes no LT table
 * @param {boolean} cfg.catalogAuthoritative — hard catalog↔chain LT equality (true)
 *                                          vs reported drift audit (false)
 * @param {"asset"|"noarg"} cfg.strategyMode — interest-rate strategy getter shape
 * @param {string}  cfg.apiSlug          — "aave-v3" / "spark" (positions route)
 * @param {string} [cfg.positionsSort]   — that route's sort key ("debtUsd" on the
 *                                          Ethereum lanes, "debt" on the Base ones)
 * @param {{origin:string,slug:string,wallets?:number}} [cfg.timeline] — enables
 *                                          check 7 against <origin>/api/chain/<slug>/timeline
 * @param {{title:string,run:Function}} [cfg.extraChecks] — this deployment's own
 *                                          checks, run as 5b over the reserves
 *                                          already read
 * @param {object}  cfg.env              — loadEnv() result
 * @returns {Promise<number>} failure count
 */
export async function run(cfg) {
  const { label, oracle, catalog, catalogAuthoritative, strategyMode, apiSlug, env, chain, rpcKey } = cfg;
  const pool = getAddress(cfg.pool);
  if (!chain || !rpcKey) throw new Error(`${label}: run() needs both chain and rpcKey — no deployment is assumed`);

  const client = createPublicClient({
    chain,
    batch: { multicall: { wait: 40 } },
    transport: http(env[rpcKey], { retryCount: 8, retryDelay: 1_000 }),
  });
  const read = (address, abi, functionName, args = []) =>
    client.readContract({ address: getAddress(address), abi, functionName, args });
  const tryRead = (address, abi, functionName, args = []) =>
    read(address, abi, functionName, args).then(
      (v) => v,
      () => null,
    );

  let failures = 0;
  const check = (name, ok, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
  };

  console.log(`\n================  ${label}  ================`);
  console.log(`Pool ${pool} · chain ${chain.name} (${chain.id}) · RPC from ${rpcKey}`);

  // ── 1. Address graph ────────────────────────────────────────────────────────
  console.log("\n## 1. Address graph");
  const provider = await read(pool, POOL_ABI, "ADDRESSES_PROVIDER");
  if (cfg.provider) {
    check(`Pool.ADDRESSES_PROVIDER == pinned provider`, eq(provider, cfg.provider), provider);
  } else {
    check(`Pool.ADDRESSES_PROVIDER resolves`, /^0x[0-9a-fA-F]{40}$/.test(provider), provider);
  }
  const [pPool, pOracle, pDataProvider] = await Promise.all([
    read(provider, PROVIDER_ABI, "getPool"),
    read(provider, PROVIDER_ABI, "getPriceOracle"),
    tryRead(provider, PROVIDER_ABI, "getPoolDataProvider"),
  ]);
  check(`provider.getPool == Pool (forward)`, eq(pPool, pool), pPool);
  check(`provider.getPriceOracle == catalog oracle`, eq(pOracle, oracle), pOracle);
  const oracleProvider = await tryRead(oracle, ORACLE_ABI, "ADDRESSES_PROVIDER");
  check(`oracle.ADDRESSES_PROVIDER == provider (reverse)`, eq(oracleProvider, provider), `${oracleProvider}`);
  check(`provider.getPoolDataProvider resolves`, typeof pDataProvider === "string", `${pDataProvider}`);
  if (typeof pDataProvider === "string") {
    const dpProvider = await tryRead(pDataProvider, DP_ABI, "ADDRESSES_PROVIDER");
    check(`dataProvider.ADDRESSES_PROVIDER == provider (reverse)`, eq(dpProvider, provider), `${dpProvider}`);
  }

  // ── shared reserve read (used by checks 2, 4, 5, 6) ─────────────────────────
  const reserveList = (await read(pool, POOL_ABI, "getReservesList")).map((a) => a.toLowerCase());
  check(`getReservesList non-empty`, reserveList.length > 0, `${reserveList.length} reserves`);
  if (reserveList.length === 0) {
    console.log(`\n${failures} check(s) failed before reserves could be read`);
    return failures;
  }
  const reserveStructs = await client.multicall({
    allowFailure: false,
    contracts: reserveList.map((a) => ({ address: pool, abi: POOL_ABI, functionName: "getReserveData", args: [a] })),
  });
  const decimalsRaw = await client.multicall({
    allowFailure: true,
    contracts: reserveList.map((a) => ({ address: getAddress(a), abi: ERC20_ABI, functionName: "decimals" })),
  });
  // Assemble a reserve record per address.
  const reserves = reserveList.map((addr, i) => {
    const s = reserveStructs[i];
    const conf = decodeConfig(s.configuration);
    const dRes = decimalsRaw[i];
    return {
      addr,
      id: s.id,
      conf,
      // The undecoded configuration word, for a deployment whose own checks
      // read a flag bit this core has no opinion about (Seamless's frozen bit).
      configRaw: s.configuration,
      aToken: s.aTokenAddress,
      vDebtToken: s.variableDebtTokenAddress,
      sDebtToken: s.stableDebtTokenAddress,
      strategy: s.interestRateStrategyAddress,
      liquidityIndex: s.liquidityIndex,
      variableBorrowIndex: s.variableBorrowIndex,
      currentLiquidityRate: s.currentLiquidityRate,
      currentVariableBorrowRate: s.currentVariableBorrowRate,
      erc20Decimals: dRes && dRes.status === "success" ? Number(dRes.result) : null,
    };
  });

  // ── 2. Constants ────────────────────────────────────────────────────────────
  console.log("\n## 2. Constants (reserve configuration)");
  // 2a — internal consistency of the LT the detail reader renders (chain-read).
  let consistent = true;
  let decimalsChecked = 0;
  let decimalsOk = 0;
  const inconsistencies = [];
  for (const r of reserves) {
    const { ltvBps, ltBps, bonusBps, decimals, reserveFactorBps } = r.conf;
    let ok = true;
    // LTV ≤ LT ≤ 100%; reserve factor ≤ 100%.
    if (ltBps > 0 && ltvBps > ltBps) ok = false;
    if (ltBps > BPSN) ok = false;
    if (reserveFactorBps > BPSN) ok = false;
    // A collateral-enabled reserve (LT>0) has a liquidation bonus ≥ 100%.
    if (ltBps > 0 && bonusBps < BPSN) ok = false;
    // A disabled reserve (LT==0) carries no bonus.
    if (ltBps === 0 && bonusBps !== 0) ok = false;
    // The config's own decimals field equals the token's ERC20 decimals.
    if (r.erc20Decimals != null) {
      decimalsChecked++;
      if (decimals === r.erc20Decimals) decimalsOk++;
    }
    if (!ok) {
      consistent = false;
      inconsistencies.push(`${r.addr} LTV=${ltvBps} LT=${ltBps} bonus=${bonusBps} rf=${reserveFactorBps}`);
    }
  }
  check(
    `every reserve config internally consistent (LTV≤LT≤1, bonus≥1 iff LT>0, rf≤1)`,
    consistent,
    `${reserves.length} reserves${inconsistencies.length ? ` · ${inconsistencies.length} bad` : ""}`,
  );
  if (inconsistencies.length) inconsistencies.slice(0, 5).forEach((s) => console.log(`      ! ${s}`));
  check(
    `config decimals == token ERC20 decimals`,
    decimalsChecked > 0 && decimalsOk === decimalsChecked,
    `${decimalsOk}/${decimalsChecked}`,
  );

  // 2b — catalog LT vs chain LT. `assets` is the set checks 2b and 3 speak
  // about: the catalog's rows that are live reserves where there is a catalog,
  // the Pool's own reserve list (symbols read from its ERC20s) where there is
  // none.
  const ltByAddr = new Map(reserves.map((r) => [r.addr, r.conf.ltBps]));
  let assets;
  if (!catalog) {
    const symbols = await client.multicall({
      allowFailure: true,
      contracts: reserves.map((r) => ({ address: getAddress(r.addr), abi: ERC20_ABI, functionName: "symbol" })),
    });
    assets = reserves.map((r, i) => ({
      symbol: symbols[i] && symbols[i].status === "success" ? symbols[i].result : r.addr,
      address: r.addr,
      lt: r.conf.ltBps / BPSN,
    }));
    console.log(
      `      NOT CHECKED: this explorer publishes no liquidation-threshold table, so there is nothing to ` +
        `cross-check 2a against — the risk parameters it renders ARE the configuration word 2a just asserted. ` +
        `The ${assets.length} assets checked below are the Pool's own reserve list, symbols off their ERC20s.`,
    );
  } else {
    assets = catalog.filter((a) => ltByAddr.has(a.address.toLowerCase()));
    check(`catalog assets present on chain`, assets.length > 0, `${assets.length}/${catalog.length}`);
  }
  if (catalog && catalogAuthoritative) {
    // Hard per-asset equality (Spark: the catalog is the freshly-verified truth).
    let allMatch = true;
    const drift = [];
    for (const a of assets) {
      const chainLtBps = ltByAddr.get(a.address.toLowerCase());
      const catBps = a.lt == null ? 0 : Math.round(a.lt * 1e4);
      if (chainLtBps !== catBps) {
        allMatch = false;
        drift.push(`${a.symbol} catalog ${catBps}bps vs chain ${chainLtBps}bps`);
      }
    }
    check(
      `catalog LT == chain LT for every catalog asset`,
      allMatch,
      `${assets.length} assets${drift.length ? ` · ${drift.length} drift` : ""}`,
    );
    drift.slice(0, 8).forEach((s) => console.log(`      ! ${s}`));
  } else if (catalog) {
    // Reported drift audit (Aave V3: catalog is a stale fallback the chain read
    // supersedes on the detail page — see the header omission note). NOT gated.
    let drifted = 0;
    let reachable = 0; // catalog is the sole source only where chain LT==0
    const reachableList = [];
    for (const a of assets) {
      const chainLtBps = ltByAddr.get(a.address.toLowerCase());
      const catBps = a.lt == null ? 0 : Math.round(a.lt * 1e4);
      if (chainLtBps !== catBps) {
        drifted++;
        if (chainLtBps === 0 && catBps !== 0) {
          reachable++;
          reachableList.push(`${a.symbol}: catalog ${catBps}bps, chain 0 (collateral disabled)`);
        }
      }
    }
    console.log(
      `      AUDIT (not gated): ${drifted}/${assets.length} catalog LTs drift from chain; ` +
        `${reachable} reach the screen via the zero-LT fallback. Detail page renders chain LT (getConfiguration), ` +
        `so headline HF/LT/USD are unaffected; catalog refresh recommended.`,
    );
    reachableList.forEach((s) => console.log(`      ! reachable-fallback ${s}`));
  }

  // ── 3. Price ────────────────────────────────────────────────────────────────
  console.log("\n## 3. Price (IAaveOracle)");
  const baseUnit = await tryRead(oracle, ORACLE_ABI, "BASE_CURRENCY_UNIT");
  check(`oracle BASE_CURRENCY_UNIT == 1e8`, baseUnit === BASE_UNIT, `${baseUnit}`);
  const priceAddrs = assets.map((a) => a.address.toLowerCase());
  const prices = await client.multicall({
    allowFailure: true,
    contracts: priceAddrs.map((a) => ({
      address: getAddress(oracle),
      abi: ORACLE_ABI,
      functionName: "getAssetPrice",
      args: [getAddress(a)],
    })),
  });
  const priceByAddr = new Map();
  let priced = 0;
  priceAddrs.forEach((a, i) => {
    if (prices[i] && prices[i].status === "success") {
      priceByAddr.set(a, prices[i].result);
      if (prices[i].result > 0n) priced++;
    }
  });
  check(
    `oracle prices every catalog reserve non-zero`,
    priceByAddr.size > 0 && priced === priceByAddr.size,
    `${priced}/${priceByAddr.size} priced`,
  );
  // $1-pegged stablecoins band $1. The yield-bearing savings wrappers (sDAI,
  // sUSDS, sUSDe) are deliberately EXCLUDED — they rebase above $1 by design, so a
  // $1 band would be a wrong assertion, not a real invariant.
  const STABLES = new Set(["USDC", "USDbC", "USDT", "DAI", "USDS", "PYUSD", "crvUSD", "FRAX", "LUSD", "RLUSD"]);
  let stablesChecked = 0;
  let stablesOk = 0;
  for (const a of assets) {
    if (!STABLES.has(a.symbol)) continue;
    const p = priceByAddr.get(a.address.toLowerCase());
    if (p == null) continue;
    stablesChecked++;
    const usd = Number(p) / Number(BASE_UNIT);
    if (usd > 0.9 && usd < 1.1) stablesOk++;
    else console.log(`      ! ${a.symbol} oracle $${usd.toFixed(4)} outside 0.90–1.10`);
  }
  check(
    `stablecoin oracle prices within $0.90–$1.10`,
    stablesChecked > 0 && stablesOk === stablesChecked,
    `${stablesOk}/${stablesChecked}`,
  );
  const majors = assets.filter((a) => ["WETH", "WBTC", "cbBTC", "wstETH"].includes(a.symbol));
  let majorOk = 0;
  for (const a of majors) {
    const p = priceByAddr.get(a.address.toLowerCase());
    if (p != null && Number(p) / Number(BASE_UNIT) > 100) majorOk++;
  }
  check(
    `ETH/BTC collateral oracle prices above $100 floor`,
    majors.length > 0 && majorOk === majors.length,
    `${majorOk}/${majors.length}`,
  );

  // ── 4. Per-reserve state ────────────────────────────────────────────────────
  console.log("\n## 4. Per-reserve state (index + liquidity identity)");
  let idxOk = true;
  for (const r of reserves) {
    if (r.liquidityIndex < RAY || r.variableBorrowIndex < RAY) {
      idxOk = false;
      console.log(`      ! ${r.addr} index below 1 RAY (liq ${r.liquidityIndex} vbi ${r.variableBorrowIndex})`);
    }
  }
  check(`every reserve's liquidity & borrow index ≥ 1 RAY`, idxOk, `${reserves.length} reserves`);
  // aToken totalSupply ≥ variable + stable debt totalSupply (available liq ≥ 0).
  const supCalls = reserves.flatMap((r) => [
    { address: getAddress(r.aToken), abi: ERC20_ABI, functionName: "totalSupply" },
    { address: getAddress(r.vDebtToken), abi: ERC20_ABI, functionName: "totalSupply" },
    { address: getAddress(r.sDebtToken), abi: ERC20_ABI, functionName: "totalSupply" },
  ]);
  const sup = await client.multicall({ allowFailure: true, contracts: supCalls });
  let liqChecked = 0;
  let liqOk = 0;
  let sampleReported = false;
  for (let i = 0; i < reserves.length; i++) {
    const aS = sup[i * 3];
    const vS = sup[i * 3 + 1];
    const sS = sup[i * 3 + 2];
    if (!aS || aS.status !== "success" || !vS || vS.status !== "success" || !sS || sS.status !== "success") continue;
    const aSup = aS.result;
    const debt = vS.result + sS.result;
    if (aSup === 0n && debt === 0n) continue; // empty reserve — nothing to assert
    liqChecked++;
    if (aSup >= debt) liqOk++;
    else console.log(`      ! ${reserves[i].addr} aToken ${aSup} < debt ${debt}`);
    // Report the underlying-held reconciliation once (inexact by virtual accounting).
    if (!sampleReported && debt > 0n && aSup > 0n) {
      const under = await tryRead(reserves[i].addr, ERC20_ABI, "balanceOf", [reserves[i].aToken]);
      if (under != null) {
        const avail = aSup - debt;
        console.log(
          `      reconcile (${reserves[i].addr.slice(0, 8)}…): aTokenSupply−debt = ${avail}, underlying held = ${under}, ` +
            `drift ${under - avail} (accruedToTreasury + virtual balance — not asserted)`,
        );
        sampleReported = true;
      }
    }
  }
  check(
    `available liquidity ≥ 0 (aToken ≥ variable+stable debt) on every active reserve`,
    liqChecked > 0 && liqOk === liqChecked,
    `${liqOk}/${liqChecked} active`,
  );

  // ── 5. Rates ────────────────────────────────────────────────────────────────
  console.log(`\n## 5. Rates (strategy bounds, ${strategyMode}-getter)`);
  const stratAbi = strategyMode === "asset" ? STRAT_ASSET_ABI : STRAT_NOARG_ABI;
  const stratArgs = (r) => (strategyMode === "asset" ? [getAddress(r.addr)] : []);
  // Only reserves carrying variable debt exercise the rate curve meaningfully.
  const rateReserves = reserves.filter(
    (r, i) => sup[i * 3 + 1] && sup[i * 3 + 1].status === "success" && sup[i * 3 + 1].result > 0n,
  );
  let rateChecked = 0;
  let boundsOk = 0;
  let identityOk = 0;
  let supplyLeqBorrowOk = 0;
  for (const r of rateReserves) {
    const [base, s1, s2, max] = await Promise.all([
      tryRead(r.strategy, stratAbi, "getBaseVariableBorrowRate", stratArgs(r)),
      tryRead(r.strategy, stratAbi, "getVariableRateSlope1", stratArgs(r)),
      tryRead(r.strategy, stratAbi, "getVariableRateSlope2", stratArgs(r)),
      tryRead(r.strategy, stratAbi, "getMaxVariableBorrowRate", stratArgs(r)),
    ]);
    if (base == null || s1 == null || s2 == null || max == null) continue; // strategy shape not readable
    rateChecked++;
    if (r.currentVariableBorrowRate >= base && r.currentVariableBorrowRate <= max) boundsOk++;
    else
      console.log(
        `      ! ${r.addr} borrowRate ${rayPct(r.currentVariableBorrowRate).toFixed(2)}% outside [${rayPct(base).toFixed(2)}, ${rayPct(max).toFixed(2)}]%`,
      );
    if (base + s1 + s2 === max) identityOk++;
    else console.log(`      ! ${r.addr} base+slope1+slope2 ≠ max (${base + s1 + s2} vs ${max})`);
    if (r.currentLiquidityRate <= r.currentVariableBorrowRate) supplyLeqBorrowOk++;
    else console.log(`      ! ${r.addr} supply rate > borrow rate`);
  }
  check(
    `strategy params readable for borrowing reserves`,
    rateChecked > 0,
    `${rateChecked}/${rateReserves.length} borrowing reserves`,
  );
  check(
    `base + slope1 + slope2 == maxVariableBorrowRate (strategy identity)`,
    rateChecked > 0 && identityOk === rateChecked,
    `${identityOk}/${rateChecked}`,
  );
  check(
    `live borrow rate within strategy [base, max]`,
    rateChecked > 0 && boundsOk === rateChecked,
    `${boundsOk}/${rateChecked}`,
  );
  check(
    `supply rate ≤ variable borrow rate`,
    rateChecked > 0 && supplyLeqBorrowOk === rateChecked,
    `${supplyLeqBorrowOk}/${rateChecked}`,
  );

  // ── 5b. Whatever is true of THIS deployment and no other ────────────────────
  // The core holds what every V3 fork shares; a fact about one market — that
  // Seamless is frozen shut, say — belongs to its entry script, which gets the
  // client and reserves this run already read rather than opening a second lane.
  if (cfg.extraChecks) {
    console.log(`\n## 5b. ${cfg.extraChecks.title}`);
    await cfg.extraChecks.run({ client, pool, reserves, check, getAddress });
  }

  // ── 6. Position sample (indexed API → getUserAccountData at head) ────────────
  console.log("\n## 6. Position sample (indexed API re-derived at head)");
  let wallets = null;
  if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) {
    console.log("      SKIP — RAILS_API_URL / API_BEARER_TOKEN not set; chain-only checks above still ran.");
  } else {
    try {
      // Largest-debt first: real positions well above the dust floor (prove the
      // biggest). If the backend ignores the sort, the set is still valid.
      const res = await fetch(
        `${env.RAILS_API_URL}/api/${apiSlug}/positions?hasDebt=true&sortBy=${cfg.positionsSort ?? "debtUsd"}&sortOrder=desc&limit=12`,
        {
          headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      wallets = (json.rows ?? []).map((r) => r.wallet).filter(Boolean);
    } catch (e) {
      console.log(`      SKIP — indexed API unreachable (${e.message}); chain-only checks above still ran.`);
    }
  }
  if (wallets && wallets.length === 0) {
    check(`indexed API returned a borrowing wallet to sample`, false, "no rows");
  } else if (wallets) {
    // Positions below $1 on either leg can't verify to tolerance in either
    // check — token-wei rounding dominates the totals reconstruction AND the
    // HF identity's integer division — so the dust floor excludes them from
    // the sample entirely (logged, never silent).
    const DUST = BASE_UNIT; // $1 in 8-decimal base currency
    let sampled = 0;
    let hfIdentityOk = 0;
    let reconSampled = 0;
    let totalsReconOk = 0;
    for (const w of wallets) {
      const wallet = getAddress(w);
      const [acct, userConf] = await Promise.all([
        tryRead(pool, POOL_ABI, "getUserAccountData", [wallet]),
        tryRead(pool, POOL_ABI, "getUserConfiguration", [wallet]),
      ]);
      if (acct == null || userConf == null) continue;
      const [totalCollateralBase, totalDebtBase, , currentLiquidationThreshold, , healthFactor] = acct;
      if (totalDebtBase === 0n) continue; // closed/repaid since the snapshot — skip

      // Positions below $1 on either leg are rounding-bound in BOTH
      // derivations: the totals reconstruction (token-wei rounding dominates)
      // AND the HF identity — the contract's half-up percentage math vs this
      // floor division diverges at wei scale (observed live on spark: HF 0 vs
      // identity 0 at rel 1.00e+0 on a sub-$1 wallet — Run 1's one stable
      // red). One dust floor gates both; a dust wallet is not sampled.
      if (totalDebtBase < DUST || totalCollateralBase < DUST) {
        console.log(`      · ${w} below $1 dust floor — excluded from the sample (rounding-bound at wei scale)`);
        continue;
      }
      sampled++;

      // (a) Aave's own HF identity: HF = collateral × LT ÷ debt.
      const manualHf = (totalCollateralBase * BigInt(currentLiquidationThreshold) * WAD) / (BPS * totalDebtBase);
      const hfDiff = manualHf > healthFactor ? manualHf - healthFactor : healthFactor - manualHf;
      const hfRel = healthFactor > 0n ? Number(hfDiff) / Number(healthFactor) : 1;
      if (hfRel < 1e-3) hfIdentityOk++;
      else
        console.log(
          `      ! ${w} HF ${Number(healthFactor) / 1e18} vs identity ${Number(manualHf) / 1e18} (rel ${hfRel.toExponential(2)})`,
        );

      // (b) Independent second path: reconstruct the USD totals from per-reserve
      // balanceOf × oracle price along the user's own collateral/debt bitmap.
      const bit = (n) => (userConf >> BigInt(n)) & 1n;
      const active = reserves.filter((r) => bit(2 * r.id) === 1n || bit(2 * r.id + 1) === 1n);
      const balCalls = active.flatMap((r) => [
        { address: getAddress(r.aToken), abi: ERC20_ABI, functionName: "balanceOf", args: [wallet] },
        { address: getAddress(r.vDebtToken), abi: ERC20_ABI, functionName: "balanceOf", args: [wallet] },
        { address: getAddress(r.sDebtToken), abi: ERC20_ABI, functionName: "balanceOf", args: [wallet] },
      ]);
      const priceCalls = active.map((r) => ({
        address: getAddress(oracle),
        abi: ORACLE_ABI,
        functionName: "getAssetPrice",
        args: [getAddress(r.addr)],
      }));
      const [bals, pxs] = await Promise.all([
        client.multicall({ allowFailure: true, contracts: balCalls }),
        client.multicall({ allowFailure: true, contracts: priceCalls }),
      ]);
      let reColl = 0n;
      let reDebt = 0n;
      let usable = true;
      active.forEach((r, i) => {
        const px = pxs[i];
        if (!px || px.status !== "success") {
          usable = false;
          return;
        }
        const price = px.result;
        const dec = r.erc20Decimals ?? r.conf.decimals;
        const scale = 10n ** BigInt(dec);
        const aBal = bals[i * 3]?.status === "success" ? bals[i * 3].result : 0n;
        const vBal = bals[i * 3 + 1]?.status === "success" ? bals[i * 3 + 1].result : 0n;
        const sBal = bals[i * 3 + 2]?.status === "success" ? bals[i * 3 + 2].result : 0n;
        if (bit(2 * r.id + 1) === 1n) reColl += (aBal * price) / scale;
        if (bit(2 * r.id) === 1n) reDebt += ((vBal + sBal) * price) / scale;
      });
      if (!usable) continue; // an oracle leg didn't price — can't reconstruct this wallet
      reconSampled++;
      const collRel =
        totalCollateralBase > 0n
          ? Number(reColl > totalCollateralBase ? reColl - totalCollateralBase : totalCollateralBase - reColl) /
            Number(totalCollateralBase)
          : 1;
      const debtRel =
        Number(reDebt > totalDebtBase ? reDebt - totalDebtBase : totalDebtBase - reDebt) / Number(totalDebtBase);
      if (collRel < 0.01 && debtRel < 0.01) totalsReconOk++;
      else
        console.log(
          `      ! ${w} totals recon: collateral $${(Number(totalCollateralBase) / 1e8).toFixed(0)} vs $${(Number(reColl) / 1e8).toFixed(0)} (${(collRel * 100).toFixed(2)}%), ` +
            `debt $${(Number(totalDebtBase) / 1e8).toFixed(0)} vs $${(Number(reDebt) / 1e8).toFixed(0)} (${(debtRel * 100).toFixed(2)}%)`,
        );
    }
    check(`sampled a borrowing wallet still open at head`, sampled > 0, `${sampled} wallets`);
    check(
      `reported HF == collateral × liqThreshold ÷ debt (Aave identity)`,
      sampled > 0 && hfIdentityOk === sampled,
      `${hfIdentityOk}/${sampled}`,
    );
    check(
      `reported USD totals reconstruct from per-reserve balanceOf × oracle price`,
      reconSampled > 0 && totalsReconOk === reconSampled,
      `${totalsReconOk}/${reconSampled} (above $1)`,
    );
  }

  // ── 7. Timeline against the chain ───────────────────────────────────────────
  if (cfg.timeline) {
    const { origin, slug, wallets: tlLimit = 3, rowsPerWallet = 3 } = cfg.timeline;
    console.log(`\n## 7. Timeline against the chain (${origin}/api/chain/${slug}/timeline)`);
    // Pin the head BEFORE fetching any timeline: every event a timeline then
    // carries at or below this block is already inside the head read, so a
    // wallet acting mid-run can only add rows above it (skipped), never
    // invalidate a claim made against it.
    const headBlock = await client.getBlockNumber();
    const sample = (wallets ?? []).slice(0, tlLimit);
    if (sample.length === 0) {
      console.log("      SKIP — no wallet to sample (check 6 had none); the chain-only checks above still ran.");
    } else {
      let rows = 0;
      let rowsFound = 0;
      let debtLegs = 0;
      let debtLegsOk = 0;
      let unreachable = 0;
      const supplyGaps = [];
      for (const w of sample) {
        const wallet = getAddress(w);
        let tl;
        try {
          const res = await hostFetch(`${origin}/api/chain/${slug}/timeline?wallet=${wallet}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          tl = await res.json();
        } catch (e) {
          unreachable++;
          console.log(`      · ${w} timeline unreachable (${e.message})`);
          continue;
        }
        const events = (tl.events ?? []).filter((ev) => ev.blockNumber <= Number(headBlock));

        // 7a — every row the page draws is a log the Pool emitted. One block per
        // getLogs call, which is the only range BASE_RPC_URL will answer.
        const OWNER_ACTIONS = new Set(["supply", "withdraw", "borrow", "repay"]);
        const newest = events
          .filter((ev) => OWNER_ACTIONS.has(ev.context && ev.context.data && ev.context.data.eventType))
          .slice(-rowsPerWallet);
        for (const ev of newest) {
          const txHash = String(ev.id).split("-")[0];
          const amount = BigInt(ev.context.data.raw.amount);
          const reserve = ev.flows[0].token.toLowerCase();
          rows++;
          let logs;
          try {
            logs = await client.getLogs({
              address: pool,
              fromBlock: BigInt(ev.blockNumber),
              toBlock: BigInt(ev.blockNumber),
            });
          } catch (e) {
            console.log(`      ! ${w} ${ev.context.data.eventType} @${ev.blockNumber}: getLogs refused (${e.message})`);
            continue;
          }
          const matched = logs.some((log) => {
            if (log.transactionHash.toLowerCase() !== txHash.toLowerCase()) return false;
            try {
              const d = decodeEventLog({ abi: POOL_EVENTS_ABI, data: log.data, topics: log.topics });
              return d.args.reserve.toLowerCase() === reserve && d.args.amount === amount;
            } catch {
              return false; // another of the Pool's events in the same block
            }
          });
          if (matched) rowsFound++;
          else
            console.log(
              `      ! ${w} ${ev.context.data.eventType} ${amount} of ${reserve.slice(0, 8)}… @${ev.blockNumber}: no Pool log in that block carries it (tx ${txHash.slice(0, 10)}…)`,
            );
        }

        // 7b/7c — the running balance each row states is a PRINCIPAL-FLOW sum
        // (Σ ±amount across the logs), which the receipt says in as many words:
        // the interest the aToken earns and the interest charged on a draw are
        // both outside it. So it is NOT a reconstruction of balanceOf, and
        // asserting equality would assert something the product does not claim.
        // What IS true of the debt leg: every subtraction it makes is a logged
        // one, so the chain's own debt can only stand ABOVE it, by the interest.
        // The supply leg has no such direction — a repayment made with aTokens
        // leaves the replay high — so it is reported and not asserted.
        const legs = new Map();
        for (const ev of events) {
          const raw = ev.context && ev.context.data && ev.context.data.raw;
          const reserve = ev.flows && ev.flows[0] && ev.flows[0].token;
          if (!raw || !reserve) continue;
          for (const [field, leg] of [
            ["supplyAfter", "supply"],
            ["debtAfter", "debt"],
          ]) {
            if (raw[field] == null) continue;
            const key = `${reserve.toLowerCase()}|${leg}`;
            const prev = legs.get(key);
            if (!prev || ev.blockNumber >= prev.block)
              legs.set(key, {
                reserve: reserve.toLowerCase(),
                leg,
                block: ev.blockNumber,
                replayed: BigInt(raw[field]),
              });
          }
        }
        for (const l of legs.values()) {
          const r = reserves.find((x) => x.addr === l.reserve);
          if (!r) continue;
          const token = getAddress(l.leg === "supply" ? r.aToken : r.vDebtToken);
          const atEvent = await client.readContract({
            address: token,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [wallet],
            blockNumber: BigInt(l.block),
          });
          const pct = l.replayed > 0n ? (Number(atEvent - l.replayed) / Number(l.replayed)) * 100 : 0;
          if (l.leg === "debt") {
            debtLegs++;
            if (atEvent >= l.replayed) debtLegsOk++;
            else
              console.log(
                `      ! ${w} debt ${l.reserve.slice(0, 8)}… @${l.block}: chain ${atEvent} BELOW the replayed principal ${l.replayed}`,
              );
          } else {
            supplyGaps.push(`${l.reserve.slice(0, 8)}… ${pct >= 0 ? "+" : ""}${pct.toFixed(4)}%`);
          }
        }
      }
      if (unreachable === sample.length) {
        console.log(`      SKIP — no timeline answered at ${origin}; the chain-only checks above still ran.`);
      } else {
        check(
          `every drawn row is a Pool log at its own block, same tx, reserve and amount`,
          rows > 0 && rowsFound === rows,
          `${rowsFound}/${rows} rows over ${sample.length - unreachable} wallet(s)`,
        );
        check(
          `chain debt ≥ the principal the replay states (the gap is the interest)`,
          debtLegs > 0 && debtLegsOk === debtLegs,
          `${debtLegsOk}/${debtLegs} legs`,
        );
        console.log(
          `      REPORTED, not asserted — supply leg chain-vs-replay gap: ${supplyGaps.join(", ") || "none sampled"}. ` +
            `It runs both ways by construction: the aToken earns interest the replay does not count, and a repayment ` +
            `made with aTokens never comes off it.`,
        );
      }
    }
  }

  console.log(failures === 0 ? `\n${label}: ALL CHECKS PASS` : `\n${label}: ${failures} CHECK(S) FAILED`);
  return failures;
}
