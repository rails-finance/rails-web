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
import { resolveErc20Meta, assertDecimalsRead } from "./erc20-meta";
import type { SparkChainReserve, SparkPositionChainResponse } from "@/lib/api/fetch-spark-position";
import { notCollateralReserves } from "@/lib/aave-v3/collateral-split";

const SPARK_POOL = SPARK_ADDRESSES.POOL as `0x${string}`;

const POOL_ABI = parseAbi([
  "function getReservesList() view returns (address[])",
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getUserConfiguration(address user) view returns (uint256 data)",
  "function getUserEMode(address user) view returns (uint256)",
  "function getEModeCategoryData(uint8 id) view returns ((uint16 ltv, uint16 liquidationThreshold, uint16 liquidationBonus, address priceSource, string label))",
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

/** The account's collateral switch for a reserve: bit 2*id+1 of the user
 *  configuration bitmap. */
export function sparkUsesAsCollateral(userConfig: bigint, reserveId: number): boolean {
  return ((userConfig >> BigInt(2 * reserveId + 1)) & BigInt(1)) === BigInt(1);
}

/** A reserve's liquidation threshold (0..1) from its configuration (bits
 *  16-31, bps); the curated catalog's where the configuration reads 0, else
 *  null. */
export function sparkReserveLt(configuration: bigint, addr: string): number | null {
  const ltBps = Number((configuration >> BigInt(16)) & BigInt(0xffff));
  return ltBps > 0 ? ltBps / PRECISION_BPS : (SPARK_LT_BY_ADDR[addr.toLowerCase()] ?? null);
}

/** A reserve's e-mode category: its configuration's bits 168-175. */
export function sparkReserveEmodeId(configuration: bigint): number {
  return Number((configuration >> BigInt(168)) & BigInt(0xff));
}

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

/** The Pool's reserves (getReservesList), kept an hour: a reserve the curated
 *  catalog does not list (RLUSD) is still read. Null where the read failed. */
let reservesList: { at: number; list: string[] } | null = null;
async function poolReserves(): Promise<string[] | null> {
  if (reservesList && Date.now() - reservesList.at < 3_600_000) return reservesList.list;
  try {
    const list = (await alchemyClient().readContract({
      address: SPARK_POOL,
      abi: POOL_ABI,
      functionName: "getReservesList",
    })) as readonly string[];
    reservesList = { at: Date.now(), list: list.map((a) => a.toLowerCase()) };
    return reservesList.list;
  } catch {
    return null;
  }
}

/**
 * Read a wallet's live SparkLend position straight from chain over the candidate
 * reserve set (the caller's, with every reserve the Pool lists — the multicall
 * returns 0 for reserves the wallet hasn't touched). Returns a `chainStale` stub on RPC failure so the
 * caller falls back to its event-derived numbers.
 */
export async function loadSparkPositionFromChain(
  walletRaw: string,
  reserveAddrs: string[],
): Promise<SparkPositionChainResponse> {
  const wallet = getAddress(walletRaw);
  const reserves = [
    ...new Set([...reserveAddrs, ...((await poolReserves()) ?? [])].map((a) => a.toLowerCase()).filter(Boolean)),
  ];

  try {
    const client = alchemyClient();

    // Phase 1 — aggregate account data + collateral bitmap (two scalar reads), and
    // the homogeneous per-reserve getReserveData multicall, in parallel.
    const [blockNumber, account, userConfig, reserveStructs, emodeId] = await Promise.all([
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
      client
        .readContract({ address: SPARK_POOL, abi: POOL_ABI, functionName: "getUserEMode", args: [wallet] })
        .then(Number)
        .catch(() => null),
    ]);
    // The wallet's e-mode category and its figures (SparkLend's Pool answers
    // the pre-3.2 getter only).
    const emodeCat =
      emodeId != null && emodeId > 0
        ? await client
            .readContract({
              address: SPARK_POOL,
              abi: POOL_ABI,
              functionName: "getEModeCategoryData",
              args: [emodeId],
            })
            .catch(() => null)
        : null;

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
    // A held reserve whose decimals did not load would scale by the 18 stand-in:
    // the read fails whole instead, and the caller keeps its indexed figures.
    assertDecimalsRead(
      metas,
      reserveData.filter((_, i) => balances[i * 4] > ZERO || balances[i * 4 + 1] > ZERO).map((r) => r.addr),
    );

    const out: SparkChainReserve[] = [];
    let supplyAssetCount = 0;
    let debtAssetCount = 0;
    reserveData.forEach(({ addr, data }, i) => {
      const supplied = balances[i * 4];
      const debt = balances[i * 4 + 1];
      const aTokenTotal = balances[i * 4 + 2]; // total supplied (available + borrowed)
      const variableDebtTotal = balances[i * 4 + 3]; // total variable debt
      const isCollateral = sparkUsesAsCollateral(userConfig, data.id);
      if (supplied === ZERO && debt === ZERO && !isCollateral) return;

      const lt = sparkReserveLt(data.configuration, addr);
      // The reserve's own max LTV (bits 0-15) and e-mode category.
      const reserveLtv = Number(data.configuration & BigInt(0xffff)) / PRECISION_BPS;
      const inEmode = emodeId != null && emodeId > 0 && sparkReserveEmodeId(data.configuration) === emodeId;
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
        ltv: reserveLtv,
        inEmode,
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
      emode:
        emodeId == null
          ? null
          : {
              id: emodeId,
              label: emodeCat?.label || null,
              ltv: emodeCat ? Number(emodeCat.ltv) / PRECISION_BPS : null,
              lt: emodeCat ? Number(emodeCat.liquidationThreshold) / PRECISION_BPS : null,
            },
    };
  } catch {
    return stub(wallet.toLowerCase());
  }
}

/**
 * The listing's collateral split: for each account, the lowercased supplied
 * reserves that back no borrowing (`notCollateralReserves`, the rule the position
 * page reads from `loadSparkPositionFromChain`). One multicall for the
 * accounts' collateral bitmaps and e-mode categories and the reserves'
 * configurations, one for the categories' thresholds. An account any of whose
 * reads failed is absent from the answer, and its row keeps no split.
 */
export async function readSparkNotCollateral(
  accounts: readonly { wallet: string; supplied: readonly string[] }[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const asked = accounts.filter((a) => a.supplied.length > 0);
  if (asked.length === 0) return out;
  try {
    const client = alchemyClient();
    const reserves = [...new Set(asked.flatMap((a) => a.supplied.map((r) => r.toLowerCase())))];
    const results = await client.multicall({
      allowFailure: true,
      contracts: [
        ...asked.flatMap(
          (a) =>
            [
              {
                address: SPARK_POOL,
                abi: POOL_ABI,
                functionName: "getUserConfiguration",
                args: [getAddress(a.wallet)],
              },
              { address: SPARK_POOL, abi: POOL_ABI, functionName: "getUserEMode", args: [getAddress(a.wallet)] },
            ] as const,
        ),
        ...reserves.map(
          (r) =>
            ({
              address: SPARK_POOL,
              abi: POOL_ABI,
              functionName: "getReserveData",
              args: [r as `0x${string}`],
            }) as const,
        ),
      ],
    });
    const reserveData = new Map<string, ReserveData>();
    reserves.forEach((r, i) => {
      const got = results[asked.length * 2 + i];
      if (got.status === "success") reserveData.set(r, got.result as unknown as ReserveData);
    });
    const userOf = (i: number) => {
      const cfg = results[i * 2];
      const em = results[i * 2 + 1];
      return cfg.status === "success" && em.status === "success"
        ? { config: cfg.result as bigint, emodeId: Number(em.result as bigint) }
        : null;
    };
    const emodeIds = [...new Set(asked.map((_, i) => userOf(i)?.emodeId ?? 0).filter((id) => id > 0))];
    const emodeLt = new Map<number, number | null>();
    if (emodeIds.length > 0) {
      const cats = await client.multicall({
        allowFailure: true,
        contracts: emodeIds.map(
          (id) => ({ address: SPARK_POOL, abi: POOL_ABI, functionName: "getEModeCategoryData", args: [id] }) as const,
        ),
      });
      emodeIds.forEach((id, i) => {
        const c = cats[i];
        if (c.status === "success") emodeLt.set(id, Number(c.result.liquidationThreshold) / PRECISION_BPS);
      });
    }
    asked.forEach((a, i) => {
      const user = userOf(i);
      if (!user) return;
      if (user.emodeId > 0 && !emodeLt.has(user.emodeId)) return;
      const reads = [];
      for (const addr of a.supplied.map((r) => r.toLowerCase())) {
        const data = reserveData.get(addr);
        if (!data) return;
        reads.push({
          address: addr,
          isCollateral: sparkUsesAsCollateral(user.config, data.id),
          lt: sparkReserveLt(data.configuration, addr),
          inEmode: user.emodeId > 0 && sparkReserveEmodeId(data.configuration) === user.emodeId,
        });
      }
      out.set(a.wallet.toLowerCase(), notCollateralReserves(reads, emodeLt.get(user.emodeId)));
    });
  } catch {
    // The RPC is down: no row keeps a split.
  }
  return out;
}
