// ============================================================================
// VERIFY: SparkLend fork deltas vs the Aave V3 assumptions the uplift ports
// ============================================================================
//
// Read-only. Every surface ported from Aave V3 onto Spark rests on a contract
// assumption; this script checks each one directly against mainnet before (and
// after) the port, so the uplift is grounded in verified chain behaviour, not
// in "it's a fork so it must match":
//
//   1. Pool.getUserAccountData returns the V3 6-tuple, HF ray-scaled, USD
//      totals in the oracle base unit — the shape the position-chain snapshot
//      and the runway/LTV widgets consume.
//   2. AddressesProvider wires a price oracle with BASE_CURRENCY_UNIT 1e8 and
//      per-asset getAssetPrice — the shape lib/aave/aave-oracle-prices.ts reads.
//   3. Pool.getReservesList + getConfiguration LT/LTV bit-packing decode the
//      same way as V3 — the LTV card / liquidation-threshold source.
//   4. eMode: category data exists and sample wallets report their category —
//      the HF interpretation the explainer prose must respect.
//   5. Reserve rate shape (currentVariableBorrowRate, ray APR) — the
//      reserve-rates panel source. DAI's governance-set (D3M) rate is printed
//      for the explainer's rate prose.
//
// Sample wallets come from the live index (/api/spark/positions) so the checks
// run against real positions, including a liquidated one.
//
// Run:  node scripts/verify-spark-fork-deltas.mjs
// Env:  .env.local — ALCHEMY_URL (chain), RAILS_API_URL + API_BEARER_TOKEN (samples)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { mainnet } from "viem/chains";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ALCHEMY_URL) throw new Error("ALCHEMY_URL missing from .env.local");

// SparkLend mainnet deployment (see rails-ops per-protocol reference).
const POOL = "0xC13e21B648A5Ee794902342038FF3aDAB66BE987";
const ADDRESSES_PROVIDER = "0x02C3eA4e34C0cBd694D2adFa2c690EECbC1793eE";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const client = createPublicClient({ chain: mainnet, transport: http(env.ALCHEMY_URL) });

const poolAbi = parseAbi([
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getReservesList() view returns (address[])",
  "function getConfiguration(address asset) view returns (uint256)",
  "function getUserEMode(address user) view returns (uint256)",
  "function getEModeCategoryData(uint8 id) view returns ((uint16 ltv, uint16 liquidationThreshold, uint16 liquidationBonus, address priceSource, string label))",
  "function getReserveData(address asset) view returns ((uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
]);
const providerAbi = parseAbi([
  "function getPriceOracle() view returns (address)",
  "function getPoolDataProvider() view returns (address)",
  "function getPool() view returns (address)",
]);
const oracleAbi = parseAbi([
  "function BASE_CURRENCY_UNIT() view returns (uint256)",
  "function getAssetPrice(address asset) view returns (uint256)",
]);
const erc20Abi = parseAbi(["function symbol() view returns (string)"]);

// V3 ReserveConfigurationMap bit layout (identical in SparkLend if the fork holds).
const decodeConfig = (data) => ({
  ltv: Number(data & 0xffffn) / 100,
  liquidationThreshold: Number((data >> 16n) & 0xffffn) / 100,
  liquidationBonus: Number((data >> 32n) & 0xffffn) / 100,
  decimals: Number((data >> 48n) & 0xffn),
  active: Boolean((data >> 56n) & 1n),
  frozen: Boolean((data >> 57n) & 1n),
  borrowingEnabled: Boolean((data >> 58n) & 1n),
  eModeCategory: Number((data >> 168n) & 0xffn),
});

const ray = (v) => Number(formatUnits(v, 27));
const pct = (n) => `${(n * 100).toFixed(2)}%`;

async function sampleWallets() {
  if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) {
    console.warn("! RAILS_API_URL/API_BEARER_TOKEN missing — skipping live-index samples");
    return [];
  }
  const get = async (qs) => {
    const r = await fetch(`${env.RAILS_API_URL}/api/spark/positions?${qs}`, {
      headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
    });
    if (!r.ok) throw new Error(`positions ${qs}: HTTP ${r.status}`);
    return r.json();
  };
  const debt = await get("hasDebt=true&limit=4");
  const liq = await get("hasLiquidations=true&limit=1");
  const rows = [...(debt.rows ?? debt.data ?? []), ...(liq.rows ?? liq.data ?? [])];
  return rows.map((r) => ({ wallet: r.wallet, liq: (r.liquidationCount ?? 0) > 0, row: r }));
}

const failures = [];
const check = (label, ok, detail) => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

// --- 1. AddressesProvider wiring -------------------------------------------
const [oracleAddr, dataProvider, poolFromProvider] = await Promise.all([
  client.readContract({ address: ADDRESSES_PROVIDER, abi: providerAbi, functionName: "getPriceOracle" }),
  client.readContract({ address: ADDRESSES_PROVIDER, abi: providerAbi, functionName: "getPoolDataProvider" }),
  client.readContract({ address: ADDRESSES_PROVIDER, abi: providerAbi, functionName: "getPool" }),
]);
check(
  "AddressesProvider.getPool → the known Pool",
  poolFromProvider.toLowerCase() === POOL.toLowerCase(),
  poolFromProvider,
);
// lib/spark/asset-catalog.ts SPARK_ADDRESSES.ORACLE must match the provider's wiring.
check("oracle matches lib/spark/asset-catalog.ts ORACLE", oracleFromCatalog() === oracleAddr.toLowerCase(), oracleAddr);
function oracleFromCatalog() {
  const src = readFileSync(join(root, "lib/spark/asset-catalog.ts"), "utf8");
  return src.match(/ORACLE:\s*"(0x[0-9a-fA-F]{40})"/)?.[1]?.toLowerCase() ?? "(not found)";
}
console.log(`  price oracle: ${oracleAddr}`);
console.log(`  data provider: ${dataProvider}`);

// --- 2. Oracle base unit + sample prices ------------------------------------
const [baseUnit, wethPrice, daiPrice] = await Promise.all([
  client.readContract({ address: oracleAddr, abi: oracleAbi, functionName: "BASE_CURRENCY_UNIT" }),
  client.readContract({ address: oracleAddr, abi: oracleAbi, functionName: "getAssetPrice", args: [WETH] }),
  client.readContract({ address: oracleAddr, abi: oracleAbi, functionName: "getAssetPrice", args: [DAI] }),
]);
check("oracle BASE_CURRENCY_UNIT = 1e8 (USD, 8dp — V3 shape)", baseUnit === 100000000n, baseUnit.toString());
console.log(`  WETH ${formatUnits(wethPrice, 8)} USD · DAI ${formatUnits(daiPrice, 8)} USD`);
check("WETH oracle price sane (500–100000 USD)", wethPrice > 500_0000_0000n && wethPrice < 100000_0000_0000n);
check("DAI oracle price sane (0.9–1.1 USD)", daiPrice > 90_000_000n && daiPrice < 110_000_000n);

// --- 3. Reserve list + LT/LTV bit-packing -----------------------------------
const reserves = await client.readContract({ address: POOL, abi: poolAbi, functionName: "getReservesList" });
console.log(`\nreserves (${reserves.length}):`);
const reserveInfo = [];
for (const asset of reserves) {
  const [symbol, cfgWord] = await Promise.all([
    client.readContract({ address: asset, abi: erc20Abi, functionName: "symbol" }).catch(() => "?"),
    client.readContract({ address: POOL, abi: poolAbi, functionName: "getConfiguration", args: [asset] }),
  ]);
  const cfg = decodeConfig(cfgWord);
  reserveInfo.push({ asset, symbol, ...cfg });
  console.log(
    `  ${symbol.padEnd(8)} ${asset}  LTV ${pct(cfg.ltv / 100)}  LT ${pct(cfg.liquidationThreshold / 100)}  bonus ${cfg.liquidationBonus}  dec ${cfg.decimals}  eMode ${cfg.eModeCategory}${cfg.frozen ? "  FROZEN" : ""}${cfg.active ? "" : "  INACTIVE"}`,
  );
}
check(
  "config bit-packing decodes sanely (every active reserve: LT 0–100%, LT ≥ LTV, decimals 6/8/18)",
  reserveInfo.every(
    (r) =>
      !r.active ||
      (r.liquidationThreshold >= 0 &&
        r.liquidationThreshold <= 100 &&
        r.liquidationThreshold >= r.ltv &&
        [6, 8, 18].includes(r.decimals)),
  ),
);

// --- 4. eMode categories ------------------------------------------------------
const usedEModes = [...new Set(reserveInfo.map((r) => r.eModeCategory).filter((c) => c > 0))];
for (const id of usedEModes) {
  const cat = await client.readContract({
    address: POOL,
    abi: poolAbi,
    functionName: "getEModeCategoryData",
    args: [id],
  });
  console.log(
    `\neMode ${id} "${cat.label}": LTV ${cat.ltv / 100}% LT ${cat.liquidationThreshold / 100}% bonus ${cat.liquidationBonus}`,
  );
  check(
    `eMode ${id} LT ≥ every member reserve's base LT`,
    reserveInfo
      .filter((r) => r.eModeCategory === id)
      .every((r) => cat.liquidationThreshold / 100 >= r.liquidationThreshold),
  );
}

// --- 5. DAI rate shape (governance-set / D3M — explainer prose input) --------
const daiData = await client.readContract({ address: POOL, abi: poolAbi, functionName: "getReserveData", args: [DAI] });
console.log(
  `\nDAI currentVariableBorrowRate: ${pct(ray(daiData.currentVariableBorrowRate))} APR (ray) — strategy ${daiData.interestRateStrategyAddress}`,
);
check(
  "DAI variable borrow rate in a sane band (0–30% APR)",
  ray(daiData.currentVariableBorrowRate) >= 0 && ray(daiData.currentVariableBorrowRate) < 0.3,
);
const wethData = await client.readContract({
  address: POOL,
  abi: poolAbi,
  functionName: "getReserveData",
  args: [WETH],
});
console.log(
  `WETH currentVariableBorrowRate: ${pct(ray(wethData.currentVariableBorrowRate))} APR · liquidityRate ${pct(ray(wethData.currentLiquidityRate))}`,
);

// --- 6. getUserAccountData on real wallets -----------------------------------
const samples = await sampleWallets();
console.log(`\nsample wallets from live index: ${samples.length}`);
const block = await client.getBlockNumber();
for (const s of samples) {
  const d = await client.readContract({
    address: POOL,
    abi: poolAbi,
    functionName: "getUserAccountData",
    args: [s.wallet],
    blockNumber: block,
  });
  const [collUsd, debtUsd, , lt, ltv, hf] = d;
  const hfStr = hf > 10n ** 40n ? "∞ (no debt)" : Number(formatUnits(hf, 18)).toFixed(4);
  const emode = await client.readContract({
    address: POOL,
    abi: poolAbi,
    functionName: "getUserEMode",
    args: [s.wallet],
  });
  console.log(
    `  ${s.wallet}${s.liq ? " (liquidated)" : ""}: coll $${formatUnits(collUsd, 8)} debt $${formatUnits(debtUsd, 8)} LT ${Number(lt) / 100}% LTV ${Number(ltv) / 100}% HF ${hfStr} eMode ${emode}`,
  );
  check(
    `getUserAccountData(${s.wallet.slice(0, 10)}…) V3-shaped (6-tuple, bps LT in 0–100%, HF ray-ish)`,
    d.length === 6 && Number(lt) <= 10000 && (debtUsd === 0n || hf > 10n ** 16n),
  );
}

console.log(`\n${failures.length === 0 ? "ALL CHECKS PASSED" : `FAILURES (${failures.length}):`}`);
failures.forEach((f) => console.log(`  ✗ ${f}`));
process.exit(failures.length === 0 ? 0 : 1);
