// A position's redemption nets summed (lib/alchemix/redemption-net.ts makes
// each). A redemption at 0 bps carries a known fee of zero shares, so a
// position with redemptions on both sides of a fee change keeps its fee
// breakdown, at mixed rates (lib/alchemix/protocol-fee.ts).
//
// No value imports: the unit tests load it as is.

import type { RedemptionNet } from "@/lib/alchemix/redemption-net";

/** The position's redemptions summed. `net` is null unless every redemption
 *  with a cleared-and-taken pair has a stated net: a sum that skips one would
 *  look complete and not be. */
export interface RedemptionNetTotal {
  counted: number;
  missingPrice: number;
  netRaw: string | null;
  /** The redemption fee summed, where every summed net carries one. `bps` is
   *  null where the redemptions ran at more than one rate. */
  fee: { bps: number | null; sharesRaw: string; valueRaw: string } | null;
  restRaw: string | null;
}

export function sumRedemptionNets(nets: (RedemptionNet | null)[]): RedemptionNetTotal {
  let counted = 0;
  let missingPrice = 0;
  let total = BigInt(0);
  let feeShares = BigInt(0);
  let feeValue = BigInt(0);
  let rest = BigInt(0);
  const rates = new Set<number>();
  let everyFee = true;
  for (const n of nets) {
    if (n == null) continue;
    if (n.status === "no-share-price") {
      missingPrice++;
      continue;
    }
    counted++;
    total += BigInt(n.netRaw);
    if (n.fee && n.restRaw != null) {
      rates.add(n.fee.bps);
      feeShares += BigInt(n.fee.sharesRaw);
      feeValue += BigInt(n.fee.valueRaw);
      rest += BigInt(n.restRaw);
    } else {
      everyFee = false;
    }
  }
  const whole = missingPrice === 0 && counted > 0;
  const withFee = whole && everyFee && rates.size > 0;
  const bps = rates.size === 1 ? [...rates][0] : null;
  return {
    counted,
    missingPrice,
    netRaw: whole ? total.toString() : null,
    fee: withFee ? { bps, sharesRaw: feeShares.toString(), valueRaw: feeValue.toString() } : null,
    restRaw: withFee ? rest.toString() : null,
  };
}
