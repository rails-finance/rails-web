"use client";

// Liquity V1 event detail (chain-state tier) — adapter onto the shared
// ChainTruthDetail grid. Shows the Trove's resulting ETH collateral + LUSD debt after
// this event, each a directly-emitted TroveUpdated absolute (chain), with a before→
// after transition (before = the previous event's emitted value). Liquity V1 is
// interest-free, so the debt after is the Trove's exact obligation — not principal.

import type { LiquityV1Context } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, reconstructTransition, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { LiquidationForensics, type LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import {
  collAfterProv,
  debtAfterProv,
  collDeltaProv,
  debtDeltaProv,
  collBeforeProv,
  debtBeforeProv,
  atBlockPriceProv,
  liqSeizedUsdProv,
  liqClearedFaceProv,
  liqPremiumProv,
  type LiquityV1Coords,
} from "@/lib/liquity-v1/event-provenance";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";

export interface LiquityV1EventDetailProps {
  ctx: LiquityV1Context;
  txHash?: string;
  blockNumber?: number;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

/** The forensics for a V1 liquidation — the whole-trove variant of the shared
 *  two-leg block. V1 wipes the trove, so the legs are the trove's ENTIRE
 *  collateral and debt entering the event (the previous TroveUpdated's emitted
 *  absolutes): ETH valued at the protocol's own PriceFeed price captured at
 *  the block, LUSD at the $1 redemption face the protocol's own ICR math uses.
 *  The premium is therefore exactly the ICR at fire − 100% — what the
 *  Stability Pool (or the redistributed troves) realized. Undefined until the
 *  block is priced; the card stays token-only meanwhile. */
function buildV1LiquidationForensics(
  ctx: LiquityV1Context,
  coords: LiquityV1Coords,
): LiquidationForensicsProps | undefined {
  const price = ctx.priceAtBlock;
  const seizedAmt = Number(ctx.collBefore);
  const clearedAmt = Number(ctx.debtBefore);
  if (!price || !Number.isFinite(seizedAmt) || !Number.isFinite(clearedAmt) || seizedAmt <= 0 || clearedAmt <= 0)
    return undefined;
  const seizedUsd = seizedAmt * price.usd;
  const clearedUsd = clearedAmt; // $1 redemption face — the protocol's own ICR denominator
  return {
    seized: {
      symbol: COLLATERAL_SYMBOL,
      usd: seizedUsd,
      usdProv: liqSeizedUsdProv(coords, { amount: `${ctx.collBefore} ${COLLATERAL_SYMBOL}`, priceUsd: price.usd }),
    },
    cleared: {
      symbol: DEBT_SYMBOL,
      usd: clearedUsd,
      usdProv: liqClearedFaceProv(coords, { amount: `${ctx.debtBefore} ${DEBT_SYMBOL}` }),
    },
    premium: seizedUsd / clearedUsd - 1,
    premiumProv: liqPremiumProv(coords, {
      seizedUsd: formatUsdValue(seizedUsd),
      clearedUsd: formatUsdValue(clearedUsd),
    }),
    pricePills: [
      {
        symbol: COLLATERAL_SYMBOL,
        priceUsd: price.usd,
        priceProv: atBlockPriceProv(coords, price.usd),
        note: "PriceFeed at block",
      },
    ],
  };
}

export function LiquityV1EventDetail({ ctx, txHash, blockNumber }: LiquityV1EventDetailProps) {
  const coords: LiquityV1Coords = { txHash, blockNumber };
  const stats: ChainTruthStat[] = [
    {
      label: "Collateral",
      value: fmt(ctx.collAfter),
      symbol: COLLATERAL_SYMBOL,
      prov: collAfterProv(coords),
      transition: reconstructTransition({
        after: ctx.collAfter,
        change: ctx.collDelta,
        changeProv: collDeltaProv(coords),
        beforeProv: collBeforeProv(coords),
      }),
    },
    {
      label: "Debt",
      value: fmt(ctx.debtAfter),
      symbol: DEBT_SYMBOL,
      prov: debtAfterProv(coords),
      transition: reconstructTransition({
        after: ctx.debtAfter,
        change: ctx.debtDelta,
        changeProv: debtDeltaProv(coords),
        beforeProv: debtBeforeProv(coords),
      }),
    },
  ];

  const forensics = ctx.eventType === "liquidation" ? buildV1LiquidationForensics(ctx, coords) : undefined;

  return (
    <>
      <ChainTruthDetail stats={stats} />
      {forensics && <LiquidationForensics {...forensics} />}
    </>
  );
}
