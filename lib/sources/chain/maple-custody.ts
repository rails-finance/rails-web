// Maple escrow custody chain read — server-only.
// ----------------------------------------------------------------------------
// What a known-infrastructure contract (a Chainlink CCIP lock-release escrow;
// lib/shared/known-infrastructure.ts) holds in each syrup pool, read directly
// at head: pool.balanceOf(holder) beside the aggregates the exit derivation
// needs (totalAssets / unrealizedLosses / totalSupply) plus the display exit
// rate. Migration 154 keeps escrow rows out of the indexed MVs by design, so
// no event replay stands behind these figures — the slot read IS the claim.
// One multicall, one block, so every figure on the custody card shares a
// coordinate.
//
// The redeemable value is computed the way the pool computes it
// (lib/maple/exit-value.ts) — BigInt over the raw aggregates, never the
// quantized one-share rate re-multiplied.
//
// Degrades to an empty array when RPC is unset/down — the custody card simply
// does not render, and the infra identity card carries the page alone.
//
// SERVER-ONLY — imported from /api/* route handlers only (alchemy via rpc.ts).

import { parseAbi } from "viem";
import { alchemyClient } from "./rpc";
import { MAPLE_POOLS } from "@/lib/maple/asset-catalog";
import { mapleExitAssetsExact } from "@/lib/maple/exit-value";

const POOL_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function unrealizedLosses() view returns (uint256)",
  "function convertToExitAssets(uint256 shares) view returns (uint256)",
]);

const UNIT = BigInt(1_000_000); // 1.0 share at 6 dp (no BigInt literals — ES2017 target)
const CALLS_PER_POOL = 5;

export interface MapleCustodyHolding {
  /** Pool key ('syrupusdc' | 'syrupusdt'). */
  pool: string;
  /** Pool share token display symbol. */
  symbol: string;
  /** Funds asset display symbol. */
  assetSymbol: string;
  /** Block the reads landed at (head, for the receipts' coordinates). */
  blockNumber: number;
  /** Shares the holder's balance slot carries (whole units). */
  shares: number;
  sharesRaw: string;
  /** What those shares redeem for at the pool's exit price (whole asset
   *  units), BigInt-exact — null when the aggregates were unusable. */
  exitValue: number | null;
  /** Display exit rate — convertToExitAssets(1e6), quantized. */
  exitRate: number;
  /** Fraction of the pool's whole share supply sitting with the holder
   *  (0..1) — null when totalSupply was unusable. */
  supplyShare: number | null;
  /** Raw twins for receipts. */
  raw: {
    shares: string;
    totalAssets: string;
    totalSupply: string;
    unrealizedLosses: string;
    exitRate: string;
  };
}

const toNum = (v: bigint, decimals: number): number => Number(v) / 10 ** decimals;

/** The holder's per-pool custody holdings — only pools where the balance
 *  resolved AND is non-zero. Empty when RPC is unavailable. */
export async function resolveMapleCustodyHoldings(holder: string): Promise<MapleCustodyHolding[]> {
  const out: MapleCustodyHolding[] = [];
  let client: ReturnType<typeof alchemyClient>;
  try {
    client = alchemyClient();
  } catch {
    return out; // ALCHEMY_URL unset — the identity card carries the page.
  }

  try {
    const blockNumber = Number(await client.getBlockNumber());
    const calls = MAPLE_POOLS.flatMap(
      (p) =>
        [
          {
            address: p.pool as `0x${string}`,
            abi: POOL_ABI,
            functionName: "balanceOf",
            args: [holder as `0x${string}`],
          },
          { address: p.pool as `0x${string}`, abi: POOL_ABI, functionName: "totalAssets" },
          { address: p.pool as `0x${string}`, abi: POOL_ABI, functionName: "totalSupply" },
          { address: p.pool as `0x${string}`, abi: POOL_ABI, functionName: "unrealizedLosses" },
          { address: p.pool as `0x${string}`, abi: POOL_ABI, functionName: "convertToExitAssets", args: [UNIT] },
        ] as const,
    );
    const res = (await client.multicall({ allowFailure: true, contracts: calls })) as {
      status: string;
      result?: unknown;
    }[];

    const val = (r: { status: string; result?: unknown } | undefined): bigint | null =>
      r?.status === "success" && r.result != null ? (r.result as bigint) : null;

    MAPLE_POOLS.forEach((p, i) => {
      const [balance, totalAssets, totalSupply, unrealizedLosses, exit] = res
        .slice(i * CALLS_PER_POOL, (i + 1) * CALLS_PER_POOL)
        .map(val);
      if (balance == null || balance <= BigInt(0) || exit == null) return;
      const agg = {
        totalAssets: totalAssets ?? BigInt(0),
        unrealizedLosses: unrealizedLosses ?? BigInt(0),
        totalSupply: totalSupply ?? BigInt(0),
      };
      out.push({
        pool: p.key,
        symbol: p.symbol,
        assetSymbol: p.assetSymbol,
        blockNumber,
        shares: toNum(balance, p.decimals),
        sharesRaw: balance.toString(),
        exitValue: mapleExitAssetsExact(balance, agg, p.decimals),
        exitRate: toNum(exit, p.decimals),
        supplyShare: agg.totalSupply > BigInt(0) ? Number(balance) / Number(agg.totalSupply) : null,
        raw: {
          shares: balance.toString(),
          totalAssets: agg.totalAssets.toString(),
          totalSupply: agg.totalSupply.toString(),
          unrealizedLosses: agg.unrealizedLosses.toString(),
          exitRate: exit.toString(),
        },
      });
    });
  } catch {
    return out;
  }

  return out;
}
