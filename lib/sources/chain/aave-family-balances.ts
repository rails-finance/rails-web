// Aave-family live position balances (Aave V3, SparkLend) — server-only.
// ----------------------------------------------------------------------------
// RETIRED from the request path (decision 0008/0011): the rails index now serves
// exact balances at the source — Σ scaled deltas from the position's own Pool
// events + aToken BalanceTransfers, × the reserve's current index (from indexed
// ReserveDataUpdated) — definitionally equal to aToken / variableDebtToken
// `balanceOf`. This reader was the tactical per-request overlay that masked the
// event-replay principal's drift (missed interest accrual, missed aToken
// transfers) until the reducer landed; it is kept, demoted, as a dev-only sanity
// check (`sanityCheckAaveBalances`): a handful of `balanceOf` reads should equal
// the reduced figure — a free in-house reconciliation, off the production path.
//
// Two multicall passes, both `allowFailure` through alchemyClient():
//   1. getReserveData(reserve) per (pool, reserve) → the aToken (struct slot 8) and
//      variableDebtToken (slot 10). Immutable per (pool, reserve) → cached for the
//      process lifetime, like the oracle feed cache.
//   2. balanceOf(wallet) over every (aToken|varDebt, wallet) pair on the page.
//
// Degrades exactly like the oracle reader (aave-oracle-prices.ts): a missing RPC
// config or a failed read simply omits that (pool, reserve, wallet).
//
// SERVER-ONLY — imported from /api/* route handlers only (it calls Alchemy via
// lib/sources/chain/rpc). Generalises lib/sources/chain/aave-v3-position.ts (one
// wallet, one Pool) to many wallets across many Pools (V3 Core/Prime/EtherFi +
// Spark are each their own Pool contract).

import { parseAbi, getAddress } from "viem";
import { alchemyClient } from "./rpc";

// The V3 `ReserveData` struct: aTokenAddress is slot index 8, variableDebtToken is
// slot index 10 (both immutable per (pool, reserve)). Same ABI SparkLend uses — it
// is a V3 fork with the identical Pool interface.
const POOL_ABI = parseAbi([
  "function getReserveData(address asset) view returns ((uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
]);
const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

export interface AaveBalanceRequest {
  /** The market's own Pool contract — V3 Core/Prime/EtherFi and Spark each differ. */
  pool: string;
  /** The wallet whose position we read. */
  wallet: string;
  /** Underlying reserve token addresses the wallet has touched on this pool. */
  reserves: string[];
}

/** A wallet's live balances for one (pool, reserve), read at head. aToken
 *  `balanceOf` ALREADY includes accrued interest (it's the rebased balance) — so
 *  `supplyRaw` IS the current figure; the replayed Σ is the principal. */
export interface AaveBalance {
  supplyRaw: bigint;
  debtRaw: bigint;
}

/** Keyed by `${pool}:${reserve}:${wallet}` (all lowercased). Present = chain read
 *  succeeded; absent = unavailable → the sanity check skips that triple. */
export type AaveBalanceMap = Map<string, AaveBalance>;

const balanceKey = (pool: string, reserve: string, wallet: string) =>
  `${pool.toLowerCase()}:${reserve.toLowerCase()}:${wallet.toLowerCase()}`;

const tokenKey = (pool: string, reserve: string) => `${pool.toLowerCase()}:${reserve.toLowerCase()}`;

/** aToken + variableDebtToken for a (pool, reserve) — immutable, so cached for the
 *  process lifetime across requests (mirrors the oracle feed cache). */
interface ReserveTokens {
  aToken: string;
  varDebt: string;
}
const tokenCache = new Map<string, ReserveTokens>();

/** Look up a resolved live balance for one (pool, reserve, wallet). */
export function aaveBalanceOf(
  map: AaveBalanceMap,
  pool: string,
  reserve: string,
  wallet: string,
): AaveBalance | undefined {
  return map.get(balanceKey(pool, reserve, wallet));
}

/** Resolve live aToken / variableDebtToken balances for every (pool, reserve,
 *  wallet) across the page, at latest block. A missing RPC config or a failed read
 *  omits that entry — callers must treat an absent balance as "chain read
 *  unavailable" and skip it, never assert a partial. */
export async function resolveAaveBalances(reqs: AaveBalanceRequest[]): Promise<AaveBalanceMap> {
  const out: AaveBalanceMap = new Map();
  if (reqs.length === 0) return out;

  let client: ReturnType<typeof alchemyClient>;
  try {
    client = alchemyClient();
  } catch {
    return out; // ALCHEMY_URL unset — no chain read.
  }

  // ── Normalise requests: distinct (pool, reserve) pairs to resolve tokens for,
  //    and distinct (pool, reserve, wallet) triples to read balanceOf for. ──
  const pairSeen = new Set<string>();
  const uncachedPairs: { pool: string; reserve: string }[] = [];
  const triples: { pool: string; reserve: string; wallet: string }[] = [];
  const tripleSeen = new Set<string>();

  for (const r of reqs) {
    const pool = r.pool.toLowerCase();
    const wallet = r.wallet.toLowerCase();
    if (!pool || !wallet) continue;
    for (const raw of r.reserves) {
      if (!raw) continue;
      const reserve = raw.toLowerCase();
      const pk = tokenKey(pool, reserve);
      if (!tokenCache.has(pk) && !pairSeen.has(pk)) {
        pairSeen.add(pk);
        uncachedPairs.push({ pool, reserve });
      }
      const tk = balanceKey(pool, reserve, wallet);
      if (!tripleSeen.has(tk)) {
        tripleSeen.add(tk);
        triples.push({ pool, reserve, wallet });
      }
    }
  }
  if (triples.length === 0) return out;

  // ── Pass 1 — resolve aToken / variableDebtToken for the uncached pairs. ──
  if (uncachedPairs.length > 0) {
    let results: unknown[] = [];
    try {
      results = (await client.multicall({
        allowFailure: true,
        contracts: uncachedPairs.map(
          (p) =>
            ({
              address: p.pool as `0x${string}`,
              abi: POOL_ABI,
              functionName: "getReserveData",
              args: [p.reserve as `0x${string}`],
            }) as const,
        ),
      })) as unknown[];
    } catch {
      results = [];
    }
    uncachedPairs.forEach((p, i) => {
      const res = results[i] as
        | { status: string; result?: { aTokenAddress: string; variableDebtTokenAddress: string } }
        | undefined;
      if (res?.status !== "success" || res.result == null) return;
      const { aTokenAddress, variableDebtTokenAddress } = res.result;
      if (!aTokenAddress || !variableDebtTokenAddress) return;
      tokenCache.set(tokenKey(p.pool, p.reserve), {
        aToken: aTokenAddress.toLowerCase(),
        varDebt: variableDebtTokenAddress.toLowerCase(),
      });
    });
  }

  // ── Pass 2 — balanceOf(wallet) on (aToken, varDebt) for every resolved triple. ──
  const readable = triples.filter((t) => tokenCache.has(tokenKey(t.pool, t.reserve)));
  if (readable.length === 0) return out;

  const balCalls = readable.flatMap((t) => {
    const tok = tokenCache.get(tokenKey(t.pool, t.reserve))!;
    const wallet = getAddress(t.wallet);
    return [
      { address: tok.aToken as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [wallet] } as const,
      { address: tok.varDebt as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [wallet] } as const,
    ];
  });

  let balances: unknown[] = [];
  try {
    balances = (await client.multicall({ allowFailure: true, contracts: balCalls })) as unknown[];
  } catch {
    balances = [];
  }

  readable.forEach((t, i) => {
    const supRes = balances[i * 2] as { status: string; result?: unknown } | undefined;
    const debtRes = balances[i * 2 + 1] as { status: string; result?: unknown } | undefined;
    // Both legs must succeed to assert a balance — a half-read would understate the
    // position. A failed leg leaves the triple absent → caller keeps the replay.
    if (supRes?.status !== "success" || debtRes?.status !== "success") return;
    if (supRes.result == null || debtRes.result == null) return;
    out.set(balanceKey(t.pool, t.reserve, t.wallet), {
      supplyRaw: supRes.result as bigint,
      debtRaw: debtRes.result as bigint,
    });
  });

  return out;
}

/** One rendered (pool, reserve, wallet) balance pair to reconcile against chain. */
export interface AaveBalanceSanityRow {
  pool: string;
  wallet: string;
  reserve: string;
  supplyRaw: bigint;
  debtRaw: bigint;
}

// Relative drift beyond which the dev sanity check warns: 0.1% (basis points ×10).
// Reduced balances sit at the indexed head; the chain read is at the live head, so
// seconds-to-minutes of interest accrual (or a not-yet-flushed event) separates
// them — tiny in the steady state, loud when the reducer is actually wrong.
const SANITY_DRIFT_BP10 = BigInt(10);
const SANITY_SCALE = BigInt(10000);

function drifted(reduced: bigint, live: bigint): boolean {
  const a = reduced < BigInt(0) ? -reduced : reduced;
  const b = live < BigInt(0) ? -live : live;
  const max = a > b ? a : b;
  if (max === BigInt(0)) return false;
  const diff = a > b ? a - b : b - a;
  return diff * SANITY_SCALE > max * SANITY_DRIFT_BP10;
}

/** Dev-only reconciliation of the REDUCED balances the page renders against live
 *  aToken / variableDebtToken `balanceOf` — the demoted role of this module now
 *  that the rails index serves exact balances (0008/0011). Fire-and-forget: never
 *  blocks or breaks the page, does nothing in production, warns on relative drift
 *  beyond 0.1% (indexed-head vs live-head accrual stays well inside that). */
export function sanityCheckAaveBalances(label: string, rows: AaveBalanceSanityRow[]): void {
  if (process.env.NODE_ENV === "production" || rows.length === 0) return;
  void (async () => {
    try {
      const map = await resolveAaveBalances(
        rows.map((r) => ({ pool: r.pool, wallet: r.wallet, reserves: [r.reserve] })),
      );
      for (const r of rows) {
        const live = aaveBalanceOf(map, r.pool, r.reserve, r.wallet);
        if (!live) continue;
        if (drifted(r.supplyRaw, live.supplyRaw) || drifted(r.debtRaw, live.debtRaw)) {
          console.warn(
            `[${label}] reduced balance drifts >0.1% from live balanceOf`,
            `wallet=${r.wallet} reserve=${r.reserve}`,
            `supply reduced=${r.supplyRaw} live=${live.supplyRaw}`,
            `debt reduced=${r.debtRaw} live=${live.debtRaw}`,
          );
        }
      }
    } catch {
      // The sanity check must never surface as a page error.
    }
  })();
}
