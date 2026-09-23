// Whole-trove liquidation forensics for the Liquity V2 forks (Ebisu, Asymmetry)
// — the fork analogue of the Liquity V1 whole-trove block, shared because the
// two forks are structural twins.
//
// This family liquidates the WHOLE trove, so the legs are the trove's ENTIRE
// collateral and debt entering the event (the previous emitted update's
// absolutes, carried on the context as collBefore/debtBefore): the branch's
// collateral valued at the branch's own PriceFeed price captured at the block
// (mig 113), the stablecoin at the $1 redemption face the protocol's own ICR
// math uses. The premium is therefore exactly the ICR at fire − 100% — what
// the branch's Stability Pool (or the redistributed troves) realized.
// Undefined until the block is priced; the card stays token-only meanwhile.

import type { EbisuContext, AsymmetryContext } from "@/lib/shared/types/event-shape";
import type { LiquityForkCoords, LiquityForkForensicsVocab } from "@/lib/shared/liquity-fork-provenance";
import type { LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import { formatUsdValue } from "@/lib/utils/format";

/** Either fork's context — structural twins for this purpose. */
export type LiquityForkForensicsContext = EbisuContext | AsymmetryContext;

export function buildForkLiquidationForensics(
  ctx: LiquityForkForensicsContext,
  coords: LiquityForkCoords,
  vocab: LiquityForkForensicsVocab,
  opts: { stablecoin: string; mcrPct?: number },
): LiquidationForensicsProps | undefined {
  const price = ctx.priceAtBlock;
  const seizedAmt = Number(ctx.collBefore);
  const clearedAmt = Number(ctx.debtBefore);
  if (!price || !Number.isFinite(seizedAmt) || !Number.isFinite(clearedAmt) || seizedAmt <= 0 || clearedAmt <= 0)
    return undefined;
  const coll = ctx.collateralSymbol;
  const seizedUsd = seizedAmt * price.usd;
  const clearedUsd = clearedAmt; // $1 redemption face — the protocol's own ICR denominator
  return {
    seized: {
      symbol: coll,
      usd: seizedUsd,
      usdProv: vocab.liqSeizedUsdProv(coords, { amount: `${ctx.collBefore} ${coll}`, priceUsd: price.usd }),
    },
    cleared: {
      symbol: opts.stablecoin,
      usd: clearedUsd,
      usdProv: vocab.liqClearedFaceProv(coords, { amount: `${ctx.debtBefore} ${opts.stablecoin}` }),
    },
    premium: seizedUsd / clearedUsd - 1,
    premiumProv: vocab.liqPremiumProv(coords, {
      seizedUsd: formatUsdValue(seizedUsd),
      clearedUsd: formatUsdValue(clearedUsd),
      mcrPct: opts.mcrPct,
    }),
    pricePills: [
      {
        symbol: coll,
        priceUsd: price.usd,
        priceProv: vocab.atBlockPriceProv(coords, price.usd),
        note: "PriceFeed at block",
      },
    ],
  };
}
