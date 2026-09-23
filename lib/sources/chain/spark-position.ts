// Live SparkLend pooled-account position — the chain detail reader. The
// near-clone of lib/sources/chain/aave-v3-position.ts (SparkLend is an Aave V3
// fork; the ABI, the account-data 6-tuple, the config bit-packing and the
// 8-decimal USD base are all fork-identical, verified on-chain by
// scripts/verify-spark-fork-deltas.mjs). One cross-collateralised account per
// wallet on a single mainnet Pool: the aggregate getUserAccountData (HF / LT /
// LTV / oracle-priced USD totals) plus, for each candidate reserve, the
// getReserveData → spToken/variableDebtToken balanceOf and the collateral
// bitmap from getUserConfiguration, collapsed into viem multicall passes at the
// live head.
//
// SERVER-ONLY.

import { parseAbi, getAddress } from "viem";
import { alchemyClient } from "./rpc";
import { SPARK_ADDRESSES, SPARK_LT_BY_ADDR } from "@/lib/spark/asset-catalog";
import { resolveErc20Meta } from "./erc20-meta";
import type { SparkChainReserve, SparkPositionChainResponse } from "@/lib/api/fetch-spark-position";

const SPARK_POOL = SPARK_ADDRESSES.POOL as `0x${string}`;

const POOL_ABI = parseAbi([
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getUserConfiguration(address user) view returns (uint256 data)",
  "function getReserveData(address asset) view returns ((uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
]);
const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]);

const PRECISION_BASE = 1e8; // base currency = 8-decimal USD (verified BASE_CURRENCY_UNIT)
const PRECISION_BPS = 1e4; // currentLiquidationThreshold / ltv are basis points
const UINT_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);
const ZERO = BigInt(0);

interface ReserveData {
  configuration: bigint;
  /** Supply APR as a ray (1e27 = 100%). */
  currentLiquidityRate: bigint;
  /** Variable borrow APR as a ray (1e27 = 100%). */
  currentVariableBorrowRate: bigint;
  id: number;
  aTokenAddress: string;
  variableDebtTokenAddress: string;
}

const RAY = 1e27; // Aave-family rates are ray-scaled APR fractions (1e27 = 100%)

function stub(wallet: string): SparkPositionChainResponse {
  return {
    wallet,
    pool: SPARK_POOL,
    blockNumber: 0,
    healthFactor: null,
    avgLiquidationThreshold: 0,
    ltv: 0,
    totalCollateralUsd: 0,
    totalDebtUsd: 0,
    availableBorrowsUsd: 0,
    supplyAssetCount: 0,
    debtAssetCount: 0,
    chainStale: true,
    reserves: [],
  };
}

/**
 * Read a wallet's live SparkLend position straight from chain over the candidate
 * reserve set (the full Spark catalog — the multicall returns 0 for reserves the
 * wallet hasn't touched). Returns a `chainStale` stub on RPC failure so the
 * caller falls back to its event-derived numbers.
 */
export async function loadSparkPositionFromChain(
  walletRaw: string,
  reserveAddrs: string[],
): Promise<SparkPositionChainResponse> {
  const wallet = getAddress(walletRaw);
  const reserves = [...new Set(reserveAddrs.map((a) => a.toLowerCase()).filter(Boolean))];

  try {
    const client = alchemyClient();

    // Phase 1 — aggregate account data + collateral bitmap (two scalar reads), and
    // the homogeneous per-reserve getReserveData multicall, in parallel.
    const [blockNumber, account, userConfig, reserveStructs] = await Promise.all([
      client.getBlockNumber().then(Number),
      client.readContract({
        address: SPARK_POOL,
        abi: POOL_ABI,
        functionName: "getUserAccountData",
        args: [wallet],
      }),
      client.readContract({
        address: SPARK_POOL,
        abi: POOL_ABI,
        functionName: "getUserConfiguration",
        args: [wallet],
      }),
      reserves.length === 0
        ? Promise.resolve([] as ReserveData[])
        : (client.multicall({
            allowFailure: false,
            contracts: reserves.map(
              (a) =>
                ({
                  address: SPARK_POOL,
                  abi: POOL_ABI,
                  functionName: "getReserveData",
                  args: [a as `0x${string}`],
                }) as const,
            ),
          }) as Promise<ReserveData[]>),
    ]);

    const reserveData = reserves.map((addr, i) => ({ addr, data: reserveStructs[i] }));

    const [
      totalCollateralBase,
      totalDebtBase,
      availableBorrowsBase,
      currentLiquidationThreshold,
      ltv,
      healthFactorRaw,
    ] = account;

    // Phase 2 — per reserve: the wallet's spToken + variableDebtToken balanceOf
    // (its position), plus each token's totalSupply (the pool aggregates that
    // give reserve utilization = total variable debt ÷ total supplied). Four
    // calls per reserve, one multicall.
    const balCalls = reserveData.flatMap(({ data }) => [
      {
        address: data.aTokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [wallet],
      } as const,
      {
        address: data.variableDebtTokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [wallet],
      } as const,
      {
        address: data.aTokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "totalSupply",
      } as const,
      {
        address: data.variableDebtTokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "totalSupply",
      } as const,
    ]);
    const balances = (await client.multicall({ allowFailure: false, contracts: balCalls })) as bigint[];

    // Symbols/decimals for the candidate reserves.
    const metas = await resolveErc20Meta(reserves);

    const out: SparkChainReserve[] = [];
    let supplyAssetCount = 0;
    let debtAssetCount = 0;
    reserveData.forEach(({ addr, data }, i) => {
      const supplied = balances[i * 4];
      const debt = balances[i * 4 + 1];
      const aTokenTotal = balances[i * 4 + 2]; // total supplied (available + borrowed)
      const variableDebtTotal = balances[i * 4 + 3]; // total variable debt
      // bit 2*id+1 of the user config bitmap = useAsCollateral
      const isCollateral = ((userConfig >> BigInt(2 * data.id + 1)) & BigInt(1)) === BigInt(1);
      if (supplied === ZERO && debt === ZERO && !isCollateral) return;

      // LT from the live reserve configuration (bits 16-31, bps); fall back to the
      // curated catalog, then null.
      const ltBps = Number((data.configuration >> BigInt(16)) & BigInt(0xffff));
      const lt = ltBps > 0 ? ltBps / PRECISION_BPS : (SPARK_LT_BY_ADDR[addr] ?? null);
      // Reserve factor — config bits 64-79 (bps); the protocol's cut of borrow
      // interest. Reserve economics, all read from the same getReserveData.
      const reserveFactor = Number((data.configuration >> BigInt(64)) & BigInt(0xffff)) / PRECISION_BPS;
      // Supply / variable-borrow APR — ray-scaled APR fractions (1e27 = 100%).
      const supplyApr = Number(data.currentLiquidityRate) / RAY;
      const borrowApr = Number(data.currentVariableBorrowRate) / RAY;
      // Reserve utilization = total variable debt ÷ total supplied. spToken total
      // supply already equals available liquidity + amount borrowed, so it's the
      // denominator directly (stable debt is nil on SparkLend).
      const utilization = aTokenTotal > ZERO ? Number(variableDebtTotal) / Number(aTokenTotal) : 0;
      const meta = metas.get(addr);
      const hasBorrow = debt > ZERO;
      if (supplied > ZERO) supplyAssetCount++;
      if (hasBorrow) debtAssetCount++;

      out.push({
        address: addr,
        symbol: meta?.symbol ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`,
        decimals: meta?.decimals ?? 18,
        supplyBalanceRaw: supplied.toString(),
        debtBalanceRaw: debt.toString(),
        isCollateral,
        hasBorrow,
        lt,
        supplyApr,
        borrowApr,
        reserveFactor,
        utilization,
      });
    });

    // Order by combined raw balance desc.
    out.sort((a, b) => {
      const av = BigInt(a.supplyBalanceRaw) + BigInt(a.debtBalanceRaw);
      const bv = BigInt(b.supplyBalanceRaw) + BigInt(b.debtBalanceRaw);
      return bv > av ? 1 : bv < av ? -1 : 0;
    });

    const noDebt = totalDebtBase === ZERO;
    return {
      wallet: wallet.toLowerCase(),
      pool: SPARK_POOL,
      blockNumber,
      healthFactor: noDebt || healthFactorRaw >= UINT_MAX ? null : Number(healthFactorRaw) / 1e18,
      avgLiquidationThreshold: Number(currentLiquidationThreshold) / PRECISION_BPS,
      ltv: Number(ltv) / PRECISION_BPS,
      totalCollateralUsd: Number(totalCollateralBase) / PRECISION_BASE,
      totalDebtUsd: Number(totalDebtBase) / PRECISION_BASE,
      availableBorrowsUsd: Number(availableBorrowsBase) / PRECISION_BASE,
      supplyAssetCount,
      debtAssetCount,
      chainStale: false,
      reserves: out,
    };
  } catch {
    return stub(wallet.toLowerCase());
  }
}
