// Two display rules of the Pendle explorer (rails-ops ui-jobs 654), pure so the
// unit tests run them directly (scripts/test/pendle-rules.test.mjs).

import type { PendleLegValues, PendleMarks, PendlePosition } from "./types";

/**
 * The SY's exchangeRate() read 0 at the block (rails-ops ui-jobs 750). Every
 * PT, YT and LP is priced in SY and every SY is then worth 0 of the asset, so
 * each figure in the asset is 0 whatever its mark in SY, matured or not, and
 * the market's implied APY is withheld. A rate that did not read (null) is not
 * this.
 */
export function syRateZero(marks: Pick<PendleMarks, "syToAsset">): boolean {
  if (marks.syToAsset == null) return false;
  try {
    return BigInt(marks.syToAsset) === BigInt(0);
  } catch {
    return false;
  }
}

/**
 * A position's values in the asset. Where the SY reads 0 (`syRateZero`), each
 * leg whose balance read is 0, the unclaimed yield is 0 where its SY amount
 * read, and the total is 0 only when all four are; an unread balance stays
 * unread and the total with it. Otherwise the server's values stand.
 */
export function assetValues(
  p: Pick<PendlePosition, "marks" | "balances" | "ytInterest"> & { value: { asset: PendleLegValues } },
): PendleLegValues {
  if (!syRateZero(p.marks)) return p.value.asset;
  const zero = (raw: string | null) => (raw == null ? null : "0");
  const legs = {
    pt: zero(p.balances.pt),
    yt: zero(p.balances.yt),
    lp: zero(p.balances.lp),
    interest: zero(p.ytInterest.sy),
  };
  const whole = Object.values(legs).every((v) => v != null);
  return { ...legs, total: whole ? "0" : null };
}

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
