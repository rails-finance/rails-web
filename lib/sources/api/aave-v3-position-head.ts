// An Aave V3-family position at the chain's head, asked of rails-server first.
// ----------------------------------------------------------------------------
// rails-server's `/api/at-block/aave-v3/position` reads the Pool once per
// market and wallet on a keyless gateway first and the paid leg last, keeps the
// answer 30 s with one read for concurrent callers, and updates the wallet's
// listing row (rails-ops decisions/0056 step 3). It answers the chain readers'
// shape (lib/sources/chain/aave-v3-position.ts, spark-position.ts) less each
// reserve's symbol and decimals, which are added here from the same token
// metadata those readers use, and with a liquidation threshold the reserve's
// configuration reads as 0 left for the catalog's figure (`ltZero`).
//
// Null when the route cannot answer: no RAILS_API_URL, a market it does not
// serve, a non-2xx answer or 8 s without one (the wallet page waits less, so
// its chain read still fits its budget). The caller then reads the chain
// as before. An answer marked `stored` is the listing's row, served because no
// read leg answered; the caller reads the chain first and keeps the row for
// when that fails too.
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { V3_LT_BY_ADDR } from "@/lib/aave-v3/asset-catalog";
import { SPARK_ADDRESSES, SPARK_LT_BY_ADDR } from "@/lib/spark/asset-catalog";
import { resolveV3Tokens } from "@/lib/sources/chain/aave-v3-tokens";
import { assertDecimalsRead, resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import type {
  AaveV3ChainReserve,
  AaveV3EMode,
  AaveV3PositionChainResponse,
  PositionHeadStamp,
  PositionStoredStamp,
} from "@/lib/api/fetch-aave-v3-position";
import type { SparkChainReserve, SparkPositionChainResponse } from "@/lib/api/fetch-spark-position";

/** How long a position page waits for the route. */
const TIMEOUT_MS = 8_000;

/** rails-server's market key per (chain, Pool), as its AAVE_V3_POSITION_MARKETS names them. */
const SERVER_MARKET: Record<string, string> = {
  "1:0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2": "core",
  "1:0x4e033931ad43597d96d6bcc25c280717730b58b1": "prime",
  "1:0x0aa97c284e98396202b6a04024f5e2c65026f3c0": "etherfi",
  "1:0xc13e21b648a5ee794902342038ff3adab66be987": "spark",
  "8453:0xa238dd80c259a72e81d7e4664a9801593f98d1c5": "base",
  "8453:0x8f44fd754285aa6a2b8b9b97739b79746e0475a7": "seamless",
  "42161:0x794a61358d6845594f94dc1db02a252b5b4814ad": "arbitrum",
};

export const serverMarketOf = (pool: string, chainId: ChainId): string | undefined =>
  SERVER_MARKET[`${chainId}:${pool.toLowerCase()}`];

type Raw = Record<string, unknown>;

/** How long to wait, and a signal that ends the wait sooner. */
export interface AskOpts {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** The route's answer as it came, or null where it cannot answer. */
async function ask(market: string, wallet: string, opts: AskOpts = {}): Promise<Raw | null> {
  const api = process.env.RAILS_API_URL;
  if (!api) return null;
  try {
    const qs = new URLSearchParams({ market, wallet: wallet.toLowerCase() });
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS);
    const res = await fetch(`${api}/api/at-block/aave-v3/position?${qs.toString()}`, {
      ...createAuthFetchOptions(),
      cache: "no-store",
      signal: opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Raw;
    return body && typeof body === "object" && Array.isArray(body.reserves) ? body : null;
  } catch {
    return null;
  }
}

/** The account's figures from the route as it answers them, unnamed: what the
 *  wallet page reads (health factor, the Pool's dollars, the held reserves'
 *  rates). Null where the route cannot answer or serves only the stored row. */
export interface AaveV3HeadFigures {
  blockNumber: number;
  healthFactor: number | null;
  totalCollateralUsd: number;
  totalDebtUsd: number;
  reserves: { address: string; debtBalanceRaw: string; borrowApr: number }[];
  head: PositionHeadStamp;
}

export async function serverAaveV3HeadFigures(
  market: string,
  wallet: string,
  opts: AskOpts = {},
): Promise<AaveV3HeadFigures | null> {
  const raw = await ask(market, wallet, opts);
  if (!raw || raw.stored || typeof raw.blockNumber !== "number" || !raw.head) return null;
  return raw as unknown as AaveV3HeadFigures;
}

const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

export interface ServerPosition<T> {
  answer: T;
  /** The listing's stored row, served because no read leg answered. */
  stored: boolean;
}

/** An Aave V3 market's position (Core, Prime, EtherFi, Base, Seamless,
 *  Arbitrum) from rails-server, named; null where the route cannot answer. */
export async function serverAaveV3Position(
  wallet: string,
  pool: string,
  chainId: ChainId,
): Promise<ServerPosition<AaveV3PositionChainResponse> | null> {
  const market = serverMarketOf(pool, chainId);
  if (!market || market === "spark") return null;
  const raw = await ask(market, wallet);
  if (!raw) return null;
  const stored = raw.stored as PositionStoredStamp | undefined;
  if (stored) {
    // The Arbitrum row keeps the page's posted read with its names; the others keep no reserves.
    if (!stored.reservesKept) return null;
    return {
      stored: true,
      answer: {
        ...(raw as unknown as AaveV3PositionChainResponse),
        availableBorrowsUsd: Number(raw.availableBorrowsUsd ?? 0),
      },
    };
  }
  return { stored: false, answer: await nameAaveV3Answer(raw, chainId) };
}

/** The route's Aave V3 answer with the web's names, in the chain reader's shape. */
export async function nameAaveV3Answer(raw: Raw, chainId: ChainId): Promise<AaveV3PositionChainResponse> {
  const reserves = raw.reserves as Raw[];
  const metas = await resolveV3Tokens(
    reserves.map((r) => r.address as string),
    chainId,
  );
  assertDecimalsRead(
    metas,
    reserves.filter((r) => r.supplyBalanceRaw !== "0" || r.debtBalanceRaw !== "0").map((r) => r.address as string),
  );
  const named: AaveV3ChainReserve[] = reserves.map((r) => {
    const addr = r.address as string;
    const meta = metas.get(addr);
    const lt = r.ltZero
      ? chainId === MAINNET_CHAIN_ID
        ? (V3_LT_BY_ADDR[addr] ?? null)
        : null
      : (r.lt as number | null);
    return {
      address: addr,
      symbol: meta?.symbol ?? short(addr),
      decimals: meta?.decimals ?? 18,
      supplyBalanceRaw: r.supplyBalanceRaw as string,
      debtBalanceRaw: r.debtBalanceRaw as string,
      isCollateral: r.isCollateral as boolean,
      hasBorrow: r.hasBorrow as boolean,
      lt,
      supplyApr: r.supplyApr as number,
      borrowApr: r.borrowApr as number,
      reserveFactor: r.reserveFactor as number,
      utilization: r.utilization as number,
      emodeCollateral: r.emodeCollateral as boolean,
      ...(r.ltZero ? { ltZero: true as const } : {}),
    };
  });
  return {
    wallet: (raw.wallet as string).toLowerCase(),
    pool: (raw.pool as string).toLowerCase(),
    blockNumber: raw.blockNumber as number,
    healthFactor: raw.healthFactor as number | null,
    avgLiquidationThreshold: raw.avgLiquidationThreshold as number,
    ltv: raw.ltv as number,
    totalCollateralUsd: raw.totalCollateralUsd as number,
    totalDebtUsd: raw.totalDebtUsd as number,
    availableBorrowsUsd: raw.availableBorrowsUsd as number,
    supplyAssetCount: raw.supplyAssetCount as number,
    debtAssetCount: raw.debtAssetCount as number,
    emode: (raw.emode as AaveV3EMode | null) ?? null,
    chainStale: false,
    reserves: named,
    head: raw.head as PositionHeadStamp,
  };
}

/** The SparkLend position from rails-server, named; null where the route
 *  cannot answer or serves only a stored row (SparkLend's keeps no reserves). */
export async function serverSparkPosition(wallet: string): Promise<SparkPositionChainResponse | null> {
  const raw = await ask("spark", wallet);
  if (!raw || raw.stored) return null;
  return nameSparkAnswer(raw);
}

/** The route's SparkLend answer with the web's names, in the chain reader's shape. */
export async function nameSparkAnswer(raw: Raw): Promise<SparkPositionChainResponse> {
  const reserves = raw.reserves as Raw[];
  const metas = await resolveErc20Meta(reserves.map((r) => r.address as string));
  assertDecimalsRead(
    metas,
    reserves.filter((r) => r.supplyBalanceRaw !== "0" || r.debtBalanceRaw !== "0").map((r) => r.address as string),
  );
  const named: SparkChainReserve[] = reserves.map((r) => {
    const addr = r.address as string;
    const meta = metas.get(addr);
    return {
      address: addr,
      symbol: meta?.symbol ?? short(addr),
      decimals: meta?.decimals ?? 18,
      supplyBalanceRaw: r.supplyBalanceRaw as string,
      debtBalanceRaw: r.debtBalanceRaw as string,
      isCollateral: r.isCollateral as boolean,
      hasBorrow: r.hasBorrow as boolean,
      lt: r.ltZero ? (SPARK_LT_BY_ADDR[addr] ?? null) : (r.lt as number | null),
      ltv: r.ltv as number,
      inEmode: r.inEmode as boolean,
      supplyApr: r.supplyApr as number,
      borrowApr: r.borrowApr as number,
      reserveFactor: r.reserveFactor as number,
      utilization: r.utilization as number,
    };
  });
  return {
    wallet: (raw.wallet as string).toLowerCase(),
    pool: SPARK_ADDRESSES.POOL,
    blockNumber: raw.blockNumber as number,
    healthFactor: raw.healthFactor as number | null,
    avgLiquidationThreshold: raw.avgLiquidationThreshold as number,
    ltv: raw.ltv as number,
    totalCollateralUsd: raw.totalCollateralUsd as number,
    totalDebtUsd: raw.totalDebtUsd as number,
    availableBorrowsUsd: raw.availableBorrowsUsd as number,
    supplyAssetCount: raw.supplyAssetCount as number,
    debtAssetCount: raw.debtAssetCount as number,
    chainStale: false,
    reserves: named,
    emode: (raw.emode as SparkPositionChainResponse["emode"]) ?? null,
    head: raw.head as PositionHeadStamp,
  };
}
