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
//
// WHAT THE NET IS MADE OF. Each redemption the Alchemist sends the Transmuter
// shares worth the debt cleared, and sends its fee receiver `protocolFee` bps
// on top of those shares (25 on Ethereum, 10 on Base; a MYT Transfer to
// protocolFeeReceiver in every redemption transaction, measured at exactly
// 0.25% of the Transmuter's transfer). A position is debited its part of both:
// its redeemed debt × (line shares out ÷ line debt redeemed) since its own last
// event. So of the shares taken here, bps ÷ (10,000 + bps) is the fee. The
// rest of the net is that averaging: the shares are charged at the line's
// shares per unit of debt across every redemption since the position last
// changed, and the share price moves between them. Across a whole line it
// comes to zero; the line's shares out are 1.0025 × the debt cleared
// (rails-ops decisions/0032).

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
      /** The line's redemption fee inside the shares taken. Null where the
       *  line's fee rate is not known. */
      fee: { bps: number; sharesRaw: string; valueRaw: string } | null;
      /** netRaw + the fee's value: what the net is besides the fee. Null with
       *  no fee figure. */
      restRaw: string | null;
    }
  | { status: "no-share-price"; atBlock: number };

const TEN = BigInt(10);
const WAD = TEN ** BigInt(18);

/** Null where the redemption has no cleared-and-taken pair to value. */
export function redemptionNet(
  event: AlchemistEvent,
  before: AlchemixReading | null,
  underlyingDecimals: number | null,
  protocolFeeBps: number | null = null,
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
  let fee: { bps: number; sharesRaw: string; valueRaw: string } | null = null;
  let rest: bigint | null = null;
  if (protocolFeeBps != null && protocolFeeBps > 0) {
    const feeShares = (BigInt(taken) * BigInt(protocolFeeBps)) / BigInt(10000 + protocolFeeBps);
    const feeValue = (feeShares * BigInt(price) * TEN ** BigInt(18 - underlyingDecimals)) / WAD;
    fee = { bps: protocolFeeBps, sharesRaw: feeShares.toString(), valueRaw: feeValue.toString() };
    rest = net + feeValue;
  }
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
    fee,
    restRaw: rest == null ? null : rest.toString(),
  };
}

/** The position's redemptions summed. `net` is null unless every redemption
 *  with a cleared-and-taken pair has a stated net: a sum that skips one would
 *  look complete and not be. */
export interface RedemptionNetTotal {
  counted: number;
  missingPrice: number;
  netRaw: string | null;
  /** The redemption fee summed, where every summed net carries one. */
  fee: { bps: number; sharesRaw: string; valueRaw: string } | null;
  restRaw: string | null;
}

export function sumRedemptionNets(nets: (RedemptionNet | null)[]): RedemptionNetTotal {
  let counted = 0;
  let missingPrice = 0;
  let total = BigInt(0);
  let feeShares = BigInt(0);
  let feeValue = BigInt(0);
  let rest = BigInt(0);
  let bps: number | null = null;
  let everyFee = true;
  for (const n of nets) {
    if (n == null) continue;
    if (n.status === "no-share-price") {
      missingPrice++;
      continue;
    }
    counted++;
    total += BigInt(n.netRaw);
    if (n.fee && n.restRaw != null && (bps == null || bps === n.fee.bps)) {
      bps = n.fee.bps;
      feeShares += BigInt(n.fee.sharesRaw);
      feeValue += BigInt(n.fee.valueRaw);
      rest += BigInt(n.restRaw);
    } else {
      everyFee = false;
    }
  }
  const whole = missingPrice === 0 && counted > 0;
  const withFee = whole && everyFee && bps != null;
  return {
    counted,
    missingPrice,
    netRaw: whole ? total.toString() : null,
    fee: withFee ? { bps: bps as number, sharesRaw: feeShares.toString(), valueRaw: feeValue.toString() } : null,
    restRaw: withFee ? rest.toString() : null,
  };
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
