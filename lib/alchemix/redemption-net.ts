// What one redemption came to for this position, in the underlying.
// ----------------------------------------------------------------------------
// Liquity V2's redemption card states the borrower's net: the debt cleared less
// the value of the collateral given up. The Alchemix figure is the same
// subtraction over two measurements this page already states, both spanning
// the same pair of readings (rails-ops decisions/0032):
//
//   net = debt cleared × 1  −  shares taken × share price at the redemption block
//
// The debt is valued at one unit of the underlying per unit of synthetic,
// which is how the protocol counts it. The share price is the one read with
// the reading at the redemption's block. Everything stays in the underlying,
// never dollars. Where that reading carries no share price the net is not
// stated, and the surface says so.

import type { AlchemistEvent } from "@/lib/alchemix/explainer-clauses";
import { collateralTakenRaw, type AlchemixReading } from "@/lib/alchemix/readings-before";

export type RedemptionNet =
  | {
      status: "stated";
      fromBlock: number;
      atBlock: number;
      clearedRaw: string;
      takenRaw: string;
      sharePriceRaw: string;
      underlyingDecimals: number;
      /** The shares taken, valued in the underlying, at 18 decimals. */
      takenValueRaw: string;
      /** cleared − taken value, signed, at 18 decimals of the underlying. */
      netRaw: string;
    }
  | { status: "no-share-price"; atBlock: number };

const TEN = BigInt(10);
const WAD = TEN ** BigInt(18);

/** Null where the redemption has no cleared-and-taken pair to value. */
export function redemptionNet(
  event: AlchemistEvent,
  before: AlchemixReading | null,
  underlyingDecimals: number | null,
): RedemptionNet | null {
  const ctx = event.context.data;
  const cleared = ctx.debtClearedFromReadings;
  const at = ctx.stateAtBlockFromReading;
  const taken = collateralTakenRaw(event, before);
  if (taken == null || cleared?.status !== "stated" || cleared.amountRaw == null) return null;
  if (cleared.fromBlock == null || cleared.atBlock == null) return null;
  const price = at?.sharePriceRaw ?? null;
  if (price == null || underlyingDecimals == null || underlyingDecimals > 18) {
    return { status: "no-share-price", atBlock: cleared.atBlock };
  }
  const takenValue = (BigInt(taken) * BigInt(price) * TEN ** BigInt(18 - underlyingDecimals)) / WAD;
  const net = BigInt(cleared.amountRaw) - takenValue;
  return {
    status: "stated",
    fromBlock: cleared.fromBlock,
    atBlock: cleared.atBlock,
    clearedRaw: cleared.amountRaw,
    takenRaw: taken,
    sharePriceRaw: price,
    underlyingDecimals,
    takenValueRaw: takenValue.toString(),
    netRaw: net.toString(),
  };
}

/** The position's redemptions summed. `net` is null unless every redemption
 *  with a cleared-and-taken pair has a stated net: a sum that skips one would
 *  look complete and not be. */
export interface RedemptionNetTotal {
  counted: number;
  missingPrice: number;
  netRaw: string | null;
}

export function sumRedemptionNets(nets: (RedemptionNet | null)[]): RedemptionNetTotal {
  let counted = 0;
  let missingPrice = 0;
  let total = BigInt(0);
  for (const n of nets) {
    if (n == null) continue;
    if (n.status === "no-share-price") {
      missingPrice++;
      continue;
    }
    counted++;
    total += BigInt(n.netRaw);
  }
  return { counted, missingPrice, netRaw: missingPrice === 0 && counted > 0 ? total.toString() : null };
}

/** How far the vault's share price could fall before the position reaches the
 *  line's liquidation line. Debt and collateral are counted in one underlying,
 *  so collateralisation moves with the share price alone: it scales by
 *  (1 − fall), and liquidation is at the lower bound, so
 *  fall = 1 − lowerBound ÷ collateralisation. Null with no debt; zero at or
 *  below the line. */
export function shareFallToLiquidation(collateralizationRaw: string | null, lowerBoundRaw: string): number | null {
  if (collateralizationRaw == null) return null;
  const ratio = Number(collateralizationRaw);
  const bound = Number(lowerBoundRaw);
  if (!(ratio > 0) || !(bound > 0)) return null;
  return Math.max(0, 1 - bound / ratio);
}
