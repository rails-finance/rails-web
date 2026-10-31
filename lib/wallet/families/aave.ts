// Aave V3 on Ethereum and Base, and SparkLend, for the wallet view (decision
// 0050, step 3; SERVER-ONLY). The card is the family's listing row, built from
// the summary row's `card` by the family's listing builder. The head read is
// the Pool's getUserAccountData for each open account (the health factor and
// the oracle dollars the position page reads) and the debt's rate from each
// borrowed reserve's getReserveData. It is asked of rails-server first
// (/api/at-block/aave-v3/position, one answer per market, every market on a
// chain at the chain's block B), waiting apiMs; the accounts
// it does not answer are read in one Multicall at one block, as before.

import { parseAbi } from "viem";
import { buildAaveV3PositionRows, type RawV3WalletRow } from "@/lib/sources/api/aave-v3-positions";
import {
  buildSparkPositionRows,
  type RawSparkWalletRow,
  type SparkReserveAmount,
} from "@/lib/sources/api/spark-positions";
import type { AaveV3PositionRow, AaveV3ReserveSummary } from "@/lib/api/fetch-aave-v3-positions";
import { MARKET_NAME, POOL_BY_MARKET, asV3Market } from "@/lib/aave-v3/asset-catalog";
import { AAVE_V3_BASE_CHAIN_ID, AAVE_V3_BASE_ORACLE, AAVE_V3_BASE_POOL } from "@/lib/aave-v3-base/asset-catalog";
import { SPARK_ADDRESSES } from "@/lib/spark/asset-catalog";
import { isSparkTreasury } from "@/lib/spark/liquidation-fee";
import { hfLabelV3 } from "@/lib/aave-v3/position-state";
import { chainClient } from "@/lib/sources/chain/rpc";
import {
  serverAaveV3HeadFigures,
  serverMarketOf,
  type AaveV3HeadFigures,
} from "@/lib/sources/api/aave-v3-position-head";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { WalletPosition, WalletPositionStatus } from "@/lib/wallet/types";
import {
  amountText,
  bufferFromHealth,
  historyBase,
  opt,
  plural,
  scaled,
  storeStamp,
  type WalletSummaryRow,
} from "@/lib/wallet/summary-row";
import type { FamilyModule, HeadResult } from "./module";

const POOL_ABI = parseAbi([
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getReserveData(address asset) view returns ((uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
]);
/** The base currency of every V3 Pool here: 8-decimal USD. */
const PRECISION_BASE = 1e8;
const RAY = 1e27;
const UINT_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);

/** "76.1 WETH +2": the largest leg by amount and how many more. */
function legsText(legs: { symbol: string; amount: number }[]): string | undefined {
  const held = legs.filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount);
  if (held.length === 0) return undefined;
  return `${amountText(held[0].amount, held[0].symbol)}${held.length > 1 ? ` +${held.length - 1}` : ""}`;
}

const reserveLegs = (reserves: AaveV3ReserveSummary[], side: "supply" | "debt") =>
  reserves.map((r) => ({
    symbol: r.symbol,
    amount: r.decimalsUnread ? 0 : scaled(side === "supply" ? r.supplyBalanceRaw : r.debtBalanceRaw, r.decimals),
  }));
const sparkLegs = (legs: SparkReserveAmount[]) =>
  legs.filter((l) => !l.decimalsUnread).map((l) => ({ symbol: l.symbol, amount: l.amount }));

function sizeOf(supply: string | undefined, debt: string | undefined) {
  if (!supply && !debt) return {};
  return { size: [supply ?? "nothing supplied", debt].filter(Boolean).join(" / "), sizeNote: "highest recorded" };
}

const liquidations = (n: number | null | undefined) => (n != null && n > 0 ? plural(n, "liquidation") : undefined);

const asStatus = (s: WalletSummaryRow["status"]): WalletPositionStatus => s;

/** What every V3 head read returns per account. */
interface AccountRead {
  hf: number | null;
  collateralUsd: number;
  debtUsd: number;
}

/**
 * One Multicall at one block over every open account's getUserAccountData
 * and every borrowed reserve's getReserveData, per Pool. Returns the reads by
 * `${pool}:${wallet}`, the rates by `${pool}:${reserve}`, and the block.
 */
async function readPools(
  chainId: ChainId,
  accounts: { pool: string; wallet: string }[],
  reserves: { pool: string; reserve: string }[],
): Promise<{ block: number; at: number; accounts: Map<string, AccountRead>; rates: Map<string, number> }> {
  const client = chainClient(chainId);
  const head = await client.getBlock();
  const blockNumber = head.number;
  const contracts = [
    ...accounts.map(
      (a) =>
        ({
          address: a.pool as `0x${string}`,
          abi: POOL_ABI,
          functionName: "getUserAccountData",
          args: [a.wallet as `0x${string}`],
        }) as const,
    ),
    ...reserves.map(
      (r) =>
        ({
          address: r.pool as `0x${string}`,
          abi: POOL_ABI,
          functionName: "getReserveData",
          args: [r.reserve as `0x${string}`],
        }) as const,
    ),
  ];
  const results = await client.multicall({ contracts, allowFailure: true, blockNumber });
  const out = new Map<string, AccountRead>();
  accounts.forEach((a, i) => {
    const r = results[i];
    if (r.status !== "success") return;
    const [coll, debt, , , , hfRaw] = r.result as readonly bigint[];
    const noDebt = debt === BigInt(0);
    out.set(`${a.pool}:${a.wallet}`, {
      hf: noDebt || hfRaw >= UINT_MAX ? null : Number(hfRaw) / 1e18,
      collateralUsd: Number(coll) / PRECISION_BASE,
      debtUsd: Number(debt) / PRECISION_BASE,
    });
  });
  const rates = new Map<string, number>();
  reserves.forEach((r, j) => {
    const res = results[accounts.length + j];
    if (res.status !== "success") return;
    const data = res.result as { currentVariableBorrowRate: bigint };
    rates.set(`${r.pool}:${r.reserve}`, Number(data.currentVariableBorrowRate) / RAY);
  });
  return { block: Number(blockNumber), at: Number(head.timestamp), accounts: out, rates };
}

/** One account's figures as the route answers them. */
function fromServer(f: AaveV3HeadFigures): { account: AccountRead; rates: Map<string, number> } {
  return {
    account: { hf: f.healthFactor, collateralUsd: f.totalCollateralUsd, debtUsd: f.totalDebtUsd },
    rates: new Map(f.reserves.map((r) => [r.address.toLowerCase(), r.borrowApr])),
  };
}

/** One Pool's account read: the figures, the borrowed reserves' rates, the block and its time. */
interface PoolRead {
  account?: AccountRead;
  rateOf: (reserve: string) => number | undefined;
  block: number;
  at: number;
}

/**
 * The head read for a wallet's accounts on one chain: rails-server's answer
 * per market first, then one Multicall at one block for every account it did
 * not answer. `reserves` names each account's borrowed reserves.
 */
async function readAccounts(
  chainId: ChainId,
  wallet: string,
  accounts: { pool: string; reserves: string[] }[],
  signal: AbortSignal,
  apiMs: number,
): Promise<{ byPool: Map<string, PoolRead>; reads: number }> {
  const byPool = new Map<string, PoolRead>();
  const served = await Promise.all(
    accounts.map(async (a) => {
      const market = serverMarketOf(a.pool, chainId);
      if (!market) return null;
      return serverAaveV3HeadFigures(market, wallet, { timeoutMs: apiMs, signal }).catch(() => null);
    }),
  );
  const rest: typeof accounts = [];
  accounts.forEach((a, i) => {
    const f = served[i];
    if (!f) return void rest.push(a);
    const { account, rates } = fromServer(f);
    byPool.set(a.pool, { account, rateOf: (x) => rates.get(x), block: f.blockNumber, at: f.head.blockTime });
  });
  let reads = served.filter(Boolean).length;
  if (rest.length > 0) {
    const r = await readPools(
      chainId,
      rest.map((a) => ({ pool: a.pool, wallet })),
      rest.flatMap((a) => a.reserves.map((reserve) => ({ pool: a.pool, reserve }))),
    );
    reads += 1;
    for (const a of rest) {
      byPool.set(a.pool, {
        account: r.accounts.get(`${a.pool}:${wallet}`),
        rateOf: (x) => r.rates.get(`${a.pool}:${x}`),
        block: r.block,
        at: r.at,
      });
    }
  }
  return { byPool, reads };
}

/** The debt-weighted rate over the borrowed legs, each at the row's oracle price. */
function weightedRate(
  legs: { address: string; amount: number }[],
  price: Record<string, number> | undefined,
  rateOf: (address: string) => number | undefined,
): number | undefined {
  let usd = 0;
  let weighted = 0;
  for (const l of legs) {
    if (l.amount <= 0) continue;
    const p = price?.[l.address.toLowerCase()];
    const r = rateOf(l.address.toLowerCase());
    if (p == null || r == null) return undefined;
    usd += l.amount * p;
    weighted += l.amount * p * r;
  }
  return usd > 0 ? weighted / usd : undefined;
}

function applyAccount(
  p: WalletPosition,
  a: AccountRead | undefined,
  block: number,
  at: number,
  rate?: number,
): WalletPosition {
  if (!a) return { ...p, headRead: "failed" };
  return {
    ...p,
    collateralUsd: a.collateralUsd,
    debtUsd: a.debtUsd,
    usdOwnOracle: true,
    buffer: a.hf == null ? undefined : bufferFromHealth(a.hf),
    riskFigure: a.hf == null ? undefined : { value: `${hfLabelV3(a.hf)} HF`, label: "Health factor" },
    liquidatable: a.hf != null && a.hf < 1,
    debtRate: a.debtUsd > 0 ? rate : undefined,
    headRead: "read",
    readAtBlock: block,
    readAt: at,
  };
}

// ── Aave V3, Ethereum and Base ──────────────────────────────────────────────

function aaveLane(lane: "ethereum" | "base"): FamilyModule {
  const chain: ChainId = lane === "ethereum" ? MAINNET_CHAIN_ID : BASE_CHAIN_ID;
  const oracle = lane === "ethereum" ? "Aave V3 oracle" : "Aave V3 Base oracle";
  const poolOf = (row: AaveV3PositionRow) =>
    (lane === "ethereum" ? POOL_BY_MARKET[asV3Market(row.market)] : AAVE_V3_BASE_POOL).toLowerCase();
  return {
    id: lane === "ethereum" ? "aave-v3" : "aave-v3-base",
    name: "Aave V3",
    chain,
    summaryChain: lane,
    summaryFamily: "aave-v3",
    async shape(rows) {
      const cards = await buildAaveV3PositionRows(
        rows.map((r) => r.card as RawV3WalletRow),
        lane === "base"
          ? { chainId: AAVE_V3_BASE_CHAIN_ID, oracle: AAVE_V3_BASE_ORACLE, pool: AAVE_V3_BASE_POOL }
          : undefined,
      );
      return rows.map((r, i): WalletPosition => {
        const row = cards[i];
        const status = asStatus(r.status);
        const base: WalletPosition = {
          chain,
          family: "aave-v3",
          familyName: "Aave V3",
          market: lane === "ethereum" ? (MARKET_NAME[row.market] ?? row.market) : undefined,
          positionId: r.positionId,
          href: r.href,
          status,
          card: { kind: "aave-v3", lane, row },
          collateralUsd: opt(r.collateralUsd),
          debtUsd: opt(r.debtUsd),
          usdSource: r.usdSource ?? oracle,
          usdOwnOracle: r.collateralUsd != null || r.debtUsd != null,
          notRead: row.status === "unread" ? true : undefined,
          headRead: "none",
          ...storeStamp(r),
        };
        if (status !== "open") {
          return {
            ...base,
            history: {
              ...historyBase(r),
              ...sizeOf(
                legsText(reserveLegs(row.peakReserves, "supply")),
                legsText(reserveLegs(row.peakReserves, "debt")),
              ),
              result: liquidations(r.liquidationCount),
            },
          };
        }
        return base;
      });
    },
    async head(open, address, signal, apiMs): Promise<HeadResult> {
      const read = open.filter((p) => !p.notRead);
      if (read.length === 0) return { positions: open, reads: 0 };
      const rowOf = (p: WalletPosition) => (p.card as { row: AaveV3PositionRow }).row;
      const wallet = address.toLowerCase();
      // One account per market: the wallet page reads one address.
      const borrowed = new Map<string, Set<string>>();
      for (const p of read) {
        const pool = poolOf(rowOf(p));
        const set = borrowed.get(pool) ?? new Set<string>();
        for (const x of rowOf(p).reserves)
          if (scaled(x.debtBalanceRaw, x.decimals) > 0) set.add(x.address.toLowerCase());
        borrowed.set(pool, set);
      }
      const r = await readAccounts(
        chain,
        wallet,
        [...borrowed].map(([pool, set]) => ({ pool, reserves: [...set] })),
        signal,
        apiMs,
      );
      return {
        reads: r.reads,
        positions: open.map((p) => {
          if (p.notRead) return p;
          const row = rowOf(p);
          const got = r.byPool.get(poolOf(row));
          if (!got) return { ...p, headRead: "failed" };
          const legs = row.reserves.map((x) => ({ address: x.address, amount: scaled(x.debtBalanceRaw, x.decimals) }));
          const rate = weightedRate(legs, row.priceByAddress, got.rateOf);
          return applyAccount(p, got.account, got.block, got.at, rate);
        }),
      };
    },
  };
}

export const aaveV3Ethereum = aaveLane("ethereum");
export const aaveV3Base = aaveLane("base");

// ── SparkLend ───────────────────────────────────────────────────────────────

const SPARK_POOL = SPARK_ADDRESSES.POOL.toLowerCase();

export const spark: FamilyModule = {
  id: "spark",
  name: "SparkLend",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "spark",
  async shape(rows) {
    // SparkLend's treasury is not a position: the listing leaves it out
    // (lib/spark/proxy-reads.ts), and so does this.
    const kept = rows.filter((r) => !isSparkTreasury((r.card as RawSparkWalletRow).wallet));
    const cards = await buildSparkPositionRows(kept.map((r) => r.card as RawSparkWalletRow));
    return kept.map((r, i): WalletPosition => {
      const row = cards[i];
      const status = asStatus(r.status);
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "spark",
        familyName: "SparkLend",
        positionId: r.positionId,
        href: r.href,
        status,
        card: { kind: "spark", row },
        collateralUsd: opt(r.collateralUsd),
        debtUsd: opt(r.debtUsd),
        usdSource: r.usdSource ?? "SparkLend oracle",
        usdOwnOracle: r.collateralUsd != null || r.debtUsd != null,
        headRead: "none",
        ...storeStamp(r),
      };
      if (status !== "open") {
        return {
          ...base,
          history: {
            ...historyBase(r),
            ...sizeOf(legsText(sparkLegs(row.peakSupplies)), legsText(sparkLegs(row.peakBorrows))),
            result: liquidations(r.liquidationCount),
          },
        };
      }
      return base;
    });
  },
  async head(open, address, signal, apiMs): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    const rowOf = (p: WalletPosition) =>
      (p.card as { kind: "spark"; row: import("@/lib/sources/api/spark-positions").SparkPositionSummary }).row;
    const reserves = [...new Set(open.flatMap((p) => rowOf(p).borrows.map((b) => b.address.toLowerCase())))];
    const r = await readAccounts(
      MAINNET_CHAIN_ID,
      address.toLowerCase(),
      [{ pool: SPARK_POOL, reserves }],
      signal,
      apiMs,
    );
    const got = r.byPool.get(SPARK_POOL);
    return {
      reads: r.reads,
      positions: open.map((p) => {
        if (!got) return { ...p, headRead: "failed" };
        const row = rowOf(p);
        const rate = weightedRate(row.borrows, row.priceByAddress, got.rateOf);
        return applyAccount(p, got.account, got.block, got.at, rate);
      }),
    };
  },
};
