"use client";

// Compound V3 (Comet) event detail (chain-state tier) — adapter onto the shared
// ChainTruthDetail grid. The touched axis's resulting on-chain balance after this
// event, replayed from the per-(market, account) signed base / per-asset
// collateral deltas; each value is a sum of chain fields and traces via <Prov>.
// Base events show the SIGNED base (lent / borrowed); collateral events show that
// asset's collateral balance. Current value WITH interest is a layer, absent.

import type { CompoundContext } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, reconstructTransition, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import {
  LiquidationForensics,
  type LiquidationForensicsProps,
  type AtBlockPricePill,
} from "@/components/shared/liquidation-forensics";
import {
  baseAfterProv,
  collateralAfterProv,
  baseDeltaProv,
  collateralDeltaProv,
  transferBaseProv,
  transferCollateralProv,
  absorbDebtProv,
  absorbCollateralProv,
  absorbDebtUsdProv,
  absorbSeizedUsdProv,
  absorbPriceProv,
  absorbMarginProv,
  baseBeforeProv,
  collateralBeforeProv,
  type CompoundCoords,
} from "@/lib/compound/event-provenance";
import { useCometMarket } from "@/lib/compound/deployment-context";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";

export interface CompoundEventDetailProps {
  ctx: CompoundContext;
  txHash?: string;
  blockNumber?: number;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

/** The absorption forensics for an absorb_debt card — Comet's model of the
 *  Aave two-leg breakdown. Both legs are the absorb events' OWN usdValue
 *  figures (the protocol's oracle reckoning, emitted in the logs), so no
 *  overlay price walk is involved: an absorption is always fully valued.
 *  The margin is what the protocol absorbed — the account's remaining
 *  cushion (or, negative, its bad-debt gap) — not a liquidator's bonus. */
function buildAbsorbForensics(ctx: CompoundContext, coords: CompoundCoords): LiquidationForensicsProps | undefined {
  const legs = ctx.absorbedCollateral;
  const clearedUsd = Number(ctx.usdValue);
  const clearedAmt = Number(ctx.assetsDelta);
  if (!legs?.length || !Number.isFinite(clearedUsd) || clearedUsd <= 0) return undefined;
  const seizedUsd = legs.reduce((sum, l) => sum + Number(l.usdValue), 0);
  if (!Number.isFinite(seizedUsd)) return undefined;

  // One at-fire price pill per asset with a usable amount (usdValue ÷ amount;
  // a dust leg with a zero-rounded amount gets no pill, its USD still counts).
  const pills: AtBlockPricePill[] = [];
  for (const l of [
    { symbol: ctx.assetSymbol, amount: String(Math.abs(clearedAmt)), usdValue: ctx.usdValue as string },
    ...legs,
  ]) {
    const amt = Number(l.amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    pills.push({
      symbol: l.symbol,
      priceUsd: Number(l.usdValue) / amt,
      priceProv: absorbPriceProv(l.symbol, coords, { amount: l.amount, usdValue: l.usdValue }),
      note: "protocol price at absorption",
    });
  }

  return {
    seized: {
      symbol: legs.length === 1 ? legs[0].symbol : undefined,
      usd: seizedUsd,
      usdProv: absorbSeizedUsdProv(coords, legs),
    },
    cleared: {
      symbol: ctx.assetSymbol,
      usd: clearedUsd,
      usdProv: absorbDebtUsdProv(ctx.assetSymbol, coords, { amount: `${Math.abs(clearedAmt)} ${ctx.assetSymbol}` }),
    },
    premium: seizedUsd / clearedUsd - 1,
    premiumProv: absorbMarginProv(coords, {
      seizedUsd: formatUsdValue(seizedUsd),
      clearedUsd: formatUsdValue(clearedUsd),
    }),
    premiumLabel: "Absorption margin",
    pricePills: pills,
  };
}

export function CompoundEventDetail({ ctx, txHash, blockNumber }: CompoundEventDetailProps) {
  const m = useCometMarket(ctx.market);
  const coords: CompoundCoords = {
    comet: m.comet,
    marketLabel: m.label,
    txHash,
    blockNumber,
    chainId: useChainId(),
    source: useCaptureSource(),
  };
  const stats: ChainTruthStat[] = [];

  if (ctx.isBase) {
    const n = Number(ctx.baseAfter ?? "0");
    // The moved-amount provenance depends on the event: an ordinary Supply /
    // Withdraw cites the base delta; an AbsorbDebt liquidation cites basePaidOut.
    const changeProv =
      ctx.eventType === "absorb_debt"
        ? absorbDebtProv(ctx.assetSymbol, coords)
        : ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out"
          ? transferBaseProv(ctx.assetSymbol, ctx.eventType === "transfer_in" ? "in" : "out", coords)
          : baseDeltaProv(ctx.assetSymbol, ctx.eventType === "supply" ? "supply" : "withdraw", coords);
    stats.push({
      label: n < 0 ? "Borrowed (base)" : "Lent (base)",
      value: fmt(ctx.baseAfter),
      symbol: ctx.assetSymbol,
      prov: baseAfterProv(ctx.assetSymbol, coords),
      transition: reconstructTransition({
        after: ctx.baseAfter,
        change: ctx.assetsDelta,
        changeProv,
        beforeProv: baseBeforeProv(ctx.assetSymbol, coords),
      }),
    });
  } else {
    const collCoords: CompoundCoords = { ...coords, asset: undefined };
    const changeProv =
      ctx.eventType === "absorb_collateral"
        ? absorbCollateralProv(ctx.assetSymbol, collCoords)
        : ctx.eventType === "transfer_collateral_in" || ctx.eventType === "transfer_collateral_out"
          ? transferCollateralProv(
              ctx.assetSymbol,
              ctx.eventType === "transfer_collateral_in" ? "in" : "out",
              collCoords,
            )
          : collateralDeltaProv(
              ctx.assetSymbol,
              ctx.eventType === "supply_collateral" ? "supply" : "withdraw",
              collCoords,
            );
    stats.push({
      label: `${ctx.assetSymbol} collateral`,
      value: fmt(ctx.collateralAfter),
      symbol: ctx.assetSymbol,
      prov: collateralAfterProv(ctx.assetSymbol, collCoords),
      transition: reconstructTransition({
        after: ctx.collateralAfter,
        change: ctx.assetsDelta,
        changeProv,
        beforeProv: collateralBeforeProv(ctx.assetSymbol, collCoords),
      }),
    });
    // The account's base position AT this event — the debt (or lent balance)
    // the collateral stack stands behind, filling the grid's second column to
    // the reference cards' Collateral | Debt shape. Static: this event moved
    // no base, so there is no transition arrow; the value cites the same
    // replayed base_after receipt the base cards cite.
    if (ctx.baseAfter != null) {
      const b = Number(ctx.baseAfter);
      stats.push({
        label: b < 0 ? "Borrowed (base)" : "Lent (base)",
        value: fmt(ctx.baseAfter),
        symbol: m.baseSymbol,
        prov: baseAfterProv(m.baseSymbol, coords),
      });
    }
  }

  const forensics = ctx.eventType === "absorb_debt" ? buildAbsorbForensics(ctx, coords) : undefined;

  return (
    <>
      <ChainTruthDetail stats={stats} />
      {forensics && <LiquidationForensics {...forensics} />}
    </>
  );
}
