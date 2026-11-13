// Two display rules of the Pendle explorer (rails-ops ui-jobs 654), pure so the
// unit tests run them directly (scripts/test/pendle-rules.test.mjs).

import type { PendlePosition } from "./types";

/**
 * Whether the wallet holds PT at the block (getUserPYInfo's ptBalance): "held",
 * "none" (read as 0) or "unread" (the read did not answer). A fixed rate is the
 * yield of holding PT, so none is shown unless it is held; "no PT held" is said
 * only where the read says 0.
 */
export function ptHolding(p: Pick<PendlePosition, "balances">): "held" | "none" | "unread" {
  const pt = p.balances.pt;
  if (pt == null) return "unread";
  return pt === "0" ? "none" : "held";
}

/**
 * An empty pool: an active market (`expired === false`) whose liquidity in SY
 * is under 0.000001 SY, the smallest figure Rails prints ("<0.000001"). Read
 * from the roster's and the market page's `tvl.sy`; no chain call. Such a
 * pool's implied APY is the rate its last trade stored (rails-ops
 * reference/official-docs/pendle.md, Read on chain 2), so Rails shows none.
 */
export function emptyPool(
  expired: boolean | null,
  tvl: { sy: string } | null | undefined,
  syDecimals: number | null,
): boolean {
  if (expired !== false || tvl == null || syDecimals == null) return false;
  try {
    return BigInt(tvl.sy) < BigInt(10) ** BigInt(Math.max(syDecimals - 6, 0));
  } catch {
    return false;
  }
}
