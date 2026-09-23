// Maple (syrup pools) per-pool chain state — server-only.
// ----------------------------------------------------------------------------
// One batched multicall over the two fixed pools (plus a second round for the
// enumerated strategies):
//   • convertToAssets / convertToExitAssets(1e6) — the NAV and EXIT share
//     rates. Exit deducts unrealizedLosses (impairments socialize to whoever
//     exits during one); the two are equal when no impairment is live.
//   • totalAssets / totalSupply / unrealizedLosses — the pool's own
//     accounting aggregates.
//   • fundsAsset.balanceOf(pool) — the LIQUID cash actually in the pool
//     contract: the only part redeemable this block. totalAssets minus this
//     is deployed — overwhelmingly loans whose collateral is custodied
//     OFF-chain (the loan legs) plus any on-chain yield strategies.
//   • strategyList(i).assetsUnderManagement() — the per-strategy deployment
//     split (the two LoanManagers are strategies too, so cash + Σ AUM ==
//     totalAssets, verified exact 2026-07-14).
//   • wmq.totalShares() — total shares waiting in the withdrawal queue.
//
// Degrades to an empty map when RPC is unset/down — callers must treat an
// absent pool as "unvalued" and fall back to amounts-only (never assert a
// partial total).
//
// SERVER-ONLY — imported from /api/* route handlers only (alchemy via rpc.ts).

import { parseAbi } from "viem";
import { alchemyClient } from "./rpc";
import { MAPLE_POOLS } from "@/lib/maple/asset-catalog";

const POOL_ABI = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function unrealizedLosses() view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function convertToExitAssets(uint256 shares) view returns (uint256)",
]);
const PM_ABI = parseAbi([
  "function strategyListLength() view returns (uint256)",
  "function strategyList(uint256 index) view returns (address)",
]);
const STRAT_ABI = parseAbi(["function assetsUnderManagement() view returns (uint256)"]);
const WMQ_ABI = parseAbi(["function totalShares() view returns (uint256)"]);
const ERC20_ABI = parseAbi(["function balanceOf(address account) view returns (uint256)"]);

const UNIT = BigInt(1_000_000); // 1.0 share / asset at 6 dp (no BigInt literals — ES2017 target)

export interface MaplePoolState {
  /** Pool key ('syrupusdc' | 'syrupusdt'). */
  pool: string;
  /** Block the reads landed at (head, for the receipts' coordinates). */
  blockNumber: number;
  /** Shares → assets at the NAV rate (whole units, e.g. 1.1734). */
  navRate: number;
  /** Shares → assets at the EXIT rate (deducts unrealizedLosses). */
  exitRate: number;
  /** Pool accounting aggregates (whole asset units). */
  totalAssets: number;
  totalSupply: number;
  unrealizedLosses: number;
  /** Liquid funds asset actually in the pool contract (whole units). */
  cash: number;
  /** Σ LoanManager AUM — principal + accrued interest of the loan book
   *  (whole units). The off-chain-custodied leg. */
  loansAum: number;
  /** The fixed-term LoanManager's own AUM (whole units) — loans that run to a
   *  maturity date. One leg of loansAum. */
  fixedTermAum: number;
  /** The open-term LoanManager's own AUM (whole units) — loans with no
   *  maturity, callable by the delegate. The other leg of loansAum. */
  openTermAum: number;
  /** Σ non-LoanManager strategy AUM (on-chain yield strategies; ~0 since
   *  Maple's 2026-04 DeFi unwind). */
  strategiesAum: number;
  /** Shares waiting in the withdrawal queue (whole units). */
  queueShares: number;
  /** Raw twins for receipts. */
  raw: {
    navRate: string;
    exitRate: string;
    totalAssets: string;
    totalSupply: string;
    unrealizedLosses: string;
    cash: string;
    queueShares: string;
  };
}

/** Keyed by pool key. Empty when RPC is unavailable. */
export type MaplePoolStateMap = Map<string, MaplePoolState>;

const toNum = (v: bigint, decimals = 6): number => Number(v) / 10 ** decimals;

export async function resolveMaplePoolState(): Promise<MaplePoolStateMap> {
  const out: MaplePoolStateMap = new Map();
  let client: ReturnType<typeof alchemyClient>;
  try {
    client = alchemyClient();
  } catch {
    return out; // ALCHEMY_URL unset — amounts-only.
  }

  try {
    const blockNumber = Number(await client.getBlockNumber());

    // Round 1: pool aggregates + rates + cash + queue + strategy counts.
    const round1 = MAPLE_POOLS.flatMap(
      (p) =>
        [
          { address: p.pool as `0x${string}`, abi: POOL_ABI, functionName: "totalAssets" },
          { address: p.pool as `0x${string}`, abi: POOL_ABI, functionName: "totalSupply" },
          { address: p.pool as `0x${string}`, abi: POOL_ABI, functionName: "unrealizedLosses" },
          { address: p.pool as `0x${string}`, abi: POOL_ABI, functionName: "convertToAssets", args: [UNIT] },
          { address: p.pool as `0x${string}`, abi: POOL_ABI, functionName: "convertToExitAssets", args: [UNIT] },
          {
            address: p.asset as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [p.pool as `0x${string}`],
          },
          { address: p.withdrawalManager as `0x${string}`, abi: WMQ_ABI, functionName: "totalShares" },
          { address: p.poolManager as `0x${string}`, abi: PM_ABI, functionName: "strategyListLength" },
        ] as const,
    );
    const r1 = (await client.multicall({ allowFailure: true, contracts: round1 })) as {
      status: string;
      result?: unknown;
    }[];

    // Round 2: enumerate each pool's strategies, then read their AUM.
    const listCalls: { address: `0x${string}`; abi: typeof PM_ABI; functionName: "strategyList"; args: [bigint] }[] =
      [];
    const listOwners: { poolIdx: number }[] = [];
    MAPLE_POOLS.forEach((p, i) => {
      const lenRes = r1[i * 8 + 7];
      const len = lenRes?.status === "success" && lenRes.result != null ? Number(lenRes.result as bigint) : 0;
      for (let s = 0; s < len; s++) {
        listCalls.push({
          address: p.poolManager as `0x${string}`,
          abi: PM_ABI,
          functionName: "strategyList",
          args: [BigInt(s)],
        });
        listOwners.push({ poolIdx: i });
      }
    });
    const r2 =
      listCalls.length > 0
        ? ((await client.multicall({ allowFailure: true, contracts: listCalls })) as {
            status: string;
            result?: unknown;
          }[])
        : [];

    const aumCalls: { address: `0x${string}`; abi: typeof STRAT_ABI; functionName: "assetsUnderManagement" }[] = [];
    const aumOwners: { poolIdx: number; strategy: string }[] = [];
    r2.forEach((res, j) => {
      if (res.status !== "success" || res.result == null) return;
      const strategy = (res.result as string).toLowerCase();
      aumCalls.push({ address: strategy as `0x${string}`, abi: STRAT_ABI, functionName: "assetsUnderManagement" });
      aumOwners.push({ poolIdx: listOwners[j].poolIdx, strategy });
    });
    const r3 =
      aumCalls.length > 0
        ? ((await client.multicall({ allowFailure: true, contracts: aumCalls })) as {
            status: string;
            result?: unknown;
          }[])
        : [];

    MAPLE_POOLS.forEach((p, i) => {
      const [totalAssets, totalSupply, unrealizedLosses, nav, exit, cash, queueShares] = r1.slice(i * 8, i * 8 + 7);
      if (nav?.status !== "success" || nav.result == null || exit?.status !== "success" || exit.result == null) return; // no rate → skip pool entirely
      let fixedTermAum = 0;
      let openTermAum = 0;
      let strategiesAum = 0;
      r3.forEach((res, j) => {
        if (aumOwners[j].poolIdx !== i || res.status !== "success" || res.result == null) return;
        const aum = toNum(res.result as bigint, p.decimals);
        if (aumOwners[j].strategy === p.fixedTermLoanManager) fixedTermAum += aum;
        else if (aumOwners[j].strategy === p.openTermLoanManager) openTermAum += aum;
        else strategiesAum += aum;
      });
      const loansAum = fixedTermAum + openTermAum;
      const val = (r: { status: string; result?: unknown } | undefined): bigint | null =>
        r?.status === "success" && r.result != null ? (r.result as bigint) : null;
      const ta = val(totalAssets);
      const ts = val(totalSupply);
      const ul = val(unrealizedLosses);
      const ca = val(cash);
      const qs = val(queueShares);
      out.set(p.key, {
        pool: p.key,
        blockNumber,
        navRate: toNum(nav.result as bigint, p.decimals),
        exitRate: toNum(exit.result as bigint, p.decimals),
        totalAssets: ta != null ? toNum(ta, p.decimals) : 0,
        totalSupply: ts != null ? toNum(ts, p.decimals) : 0,
        unrealizedLosses: ul != null ? toNum(ul, p.decimals) : 0,
        cash: ca != null ? toNum(ca, p.decimals) : 0,
        loansAum,
        fixedTermAum,
        openTermAum,
        strategiesAum,
        queueShares: qs != null ? toNum(qs, p.decimals) : 0,
        raw: {
          navRate: (nav.result as bigint).toString(),
          exitRate: (exit.result as bigint).toString(),
          totalAssets: ta?.toString() ?? "0",
          totalSupply: ts?.toString() ?? "0",
          unrealizedLosses: ul?.toString() ?? "0",
          cash: ca?.toString() ?? "0",
          queueShares: qs?.toString() ?? "0",
        },
      });
    });
  } catch {
    return out;
  }

  return out;
}
