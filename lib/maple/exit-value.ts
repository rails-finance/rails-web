// The pool's own exit answer for a share count — BigInt-exact.
// ----------------------------------------------------------------------------
// A Maple claim is worth what the pool says it is worth:
//
//   convertToExitAssets(shares) == shares × (totalAssets − unrealizedLosses) ÷ totalSupply
//
// which scripts/verify-maple-chain.mjs proves BigInt-exact against the live
// contract at several share sizes, on both pools.
//
// Multiplying a float share count by `exitRate` is NOT that number. `exitRate`
// is convertToExitAssets(1e6) — the pool's answer for ONE share, already
// truncated to the asset's 6 dp — so re-multiplying it scales that truncation
// up by the size of the holding, drifting from the pool by several ppm (~8 ppm
// observed, worst ~0.58 USDT in absolute terms on the sampled wallets). The
// current-value receipt tells the reader to "re-run the pool's
// convertToExitAssets eth_call on the wallet's share count — it reproduces this
// figure", so the drift made a VERIFY INSTRUCTION THAT DOES NOT VERIFY. On an
// explorer whose whole claim is that its numbers are the chain's, that is the
// defect — not the fraction of a cent.
//
// So: compute it the way the pool does, from the raw aggregates the same
// multicall already returned (MaplePoolState.raw). The quantized `exitRate`
// stays what it always was — a rate to DISPLAY (the band's headline, the card's
// "@ 1.1736" footnote), traced to convertToExitAssets(1e6) — but it is no
// longer the basis of any rendered claim.

import { MAPLE_POOL_BY_KEY } from "@/lib/maple/asset-catalog";
import type { MaplePoolState } from "@/lib/sources/chain/maple-pool-state";

const ZERO = BigInt(0);

/** Parse a raw uint string defensively — the aggregates ride the wire. */
function bigintOf(raw: string | null | undefined): bigint {
  if (raw == null || raw === "") return ZERO;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return ZERO;
  }
}

/**
 * The pool's exit arithmetic over raw aggregates — the shared core of
 * `mapleExitAssets` and the escrow custody reader. Returns `null` when the
 * aggregates are unusable (totalSupply at 0 from a partial read) so callers
 * choose their own degradation instead of rendering a zero claim.
 */
export function mapleExitAssetsExact(
  shares: bigint,
  agg: { totalAssets: bigint; unrealizedLosses: bigint; totalSupply: bigint },
  decimals: number,
): number | null {
  if (agg.totalSupply <= ZERO) return null;
  const assets = (shares * (agg.totalAssets - agg.unrealizedLosses)) / agg.totalSupply;
  return Number(assets) / 10 ** decimals;
}

/**
 * What `shares` redeem for at the pool's exit price, computed as the pool
 * computes it. `sharesRaw` is the un-scaled integer (6 dp on both syrup pools).
 *
 * Falls back to the quantized rate only when the aggregates are unusable — a
 * partial multicall can leave totalSupply at 0 while the rates still resolved,
 * and rendering a zero claim there would be a worse lie than a few ppm.
 */
export function mapleExitAssets(sharesRaw: string | bigint, state: MaplePoolState): number {
  const decimals = MAPLE_POOL_BY_KEY[state.pool]?.decimals ?? 6;
  const shares = typeof sharesRaw === "bigint" ? sharesRaw : bigintOf(sharesRaw);
  const exact = mapleExitAssetsExact(
    shares,
    {
      totalAssets: bigintOf(state.raw.totalAssets),
      unrealizedLosses: bigintOf(state.raw.unrealizedLosses),
      totalSupply: bigintOf(state.raw.totalSupply),
    },
    decimals,
  );
  return exact ?? (Number(shares) / 10 ** decimals) * state.exitRate;
}
