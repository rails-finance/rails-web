// Liquity-fork (Ebisu / Asymmetry) per-branch oracle prices — server-only.
// ----------------------------------------------------------------------------
// One batched multicall over a fork's branch PriceFeeds:
//   • fetchPrice — SIMULATED via eth_call (state-mutating on-chain, read-only
//     under eth_call — the Liquity V1 pattern): the LIVE price the branch
//     would liquidate and redeem with right now.
//   • lastGoodPrice — the fallback when the simulation fails: the last value
//     a user operation fetched. It lags between operations on a quiet branch,
//     so rows priced this way carry `stale: true`.
// Price scale is 1e(36 − collateral decimals) — proven by the BigInt-exact
// getCurrentICR identity in scripts/verify-liquity-forks-chain.mjs.
//
// Degrades to an empty map when RPC is unset/down — callers must treat an
// absent branch as "unpriced" and fall back to amounts-only (never assert a
// partial total).
//
// SERVER-ONLY — imported from /api/* route handlers only (RPC via rpc.ts).
// Fork-agnostic AND chain-agnostic: Ebisu/Asymmetry read L1, basedollar reads
// Base, and the PriceFeed interface is identical on both.

import { parseAbi } from "viem";
import { chainClient } from "./rpc";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { LiquityForkBranchConfig } from "./liquity-fork-position";

// fetchPrice mutates on-chain; declared view so eth_call simulates it.
const PF_ABI = parseAbi([
  "function fetchPrice() view returns (uint256, bool)",
  "function lastGoodPrice() view returns (uint256)",
]);

export interface LiquityForkBranchPrice {
  /** USD per whole collateral token, from the branch's own PriceFeed. */
  priceUsd: number;
  /** True when only lastGoodPrice answered (lags between user operations). */
  stale: boolean;
}

/** Keyed by branch key. Empty when RPC is unavailable. */
export type LiquityForkPriceMap = Map<string, LiquityForkBranchPrice>;

export async function resolveLiquityForkPrices(
  branches: LiquityForkBranchConfig[],
  chainId: ChainId = MAINNET_CHAIN_ID,
): Promise<LiquityForkPriceMap> {
  const out: LiquityForkPriceMap = new Map();
  let client: ReturnType<typeof chainClient>;
  try {
    client = chainClient(chainId);
  } catch {
    return out; // that chain's RPC env unset — amounts-only.
  }

  const calls = branches.flatMap(
    (b) =>
      [
        { address: b.priceFeed as `0x${string}`, abi: PF_ABI, functionName: "fetchPrice" },
        { address: b.priceFeed as `0x${string}`, abi: PF_ABI, functionName: "lastGoodPrice" },
      ] as const,
  );

  let results: { status: string; result?: unknown }[] = [];
  try {
    results = (await client.multicall({ allowFailure: true, contracts: calls })) as {
      status: string;
      result?: unknown;
    }[];
  } catch {
    return out;
  }

  branches.forEach((b, i) => {
    const [fetched, last] = results.slice(i * 2, i * 2 + 2);
    const scale = 10 ** (36 - b.decimals); // USD-per-whole-token divisor
    const fetchedRaw =
      fetched?.status === "success" && Array.isArray(fetched.result) ? (fetched.result[0] as bigint) : null;
    const lastRaw = last?.status === "success" && last.result != null ? (last.result as bigint) : null;
    const raw = fetchedRaw != null && fetchedRaw > BigInt(0) ? fetchedRaw : lastRaw;
    if (raw == null || raw <= BigInt(0)) return; // unpriced — absence, never 0
    out.set(b.key, {
      priceUsd: Number(raw) / scale,
      stale: !(fetchedRaw != null && fetchedRaw > BigInt(0)),
    });
  });

  return out;
}
