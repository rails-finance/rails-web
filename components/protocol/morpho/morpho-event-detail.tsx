"use client";

// Morpho event detail (chain-state tier) — adapter onto the shared
// ChainTruthDetail grid. The position's collateral and borrowed / supplied
// PRINCIPAL after this event, replayed from the deltas; each value is a sum of
// chain fields and traces via <Prov>. The side this event didn't touch is dimmed.
// Current debt with interest (shares × index) is a layer on the position card.

import type { AssetFlow, MorphoContext } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, reconstructTransition, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { LiquidationForensics, type LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import {
  collateralAfterProv,
  borrowedAfterProv,
  assetsDeltaProv,
  collateralBeforeProv,
  borrowedBeforeProv,
  suppliedAfterProv,
  suppliedBeforeProv,
  atBlockOraclePriceProv,
  liqSeizedValueProv,
  liqClearedValueProv,
  liqPremiumProv,
  type MorphoCoords,
} from "@/lib/morpho/event-provenance";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { formatNumber } from "@/lib/utils/format";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";

export interface MorphoEventDetailProps {
  ctx: MorphoContext;
  txHash?: string;
  blockNumber?: number;
  /** The event's own asset flows. Not data for the grid — the grid's figures
   *  all come from `ctx` — but the only place on this card that names the
   *  CONTRACT behind a symbol. MorphoContext carries `loanSymbol` and
   *  `collateralSymbol` and no addresses, and Morpho Blue is permissionless, so
   *  a symbol here identifies nothing the icon chip can look up. */
  flows?: AssetFlow[];
}

const fmt = (human: string): string => formatNumber(Number(human));

/** The forensics for a Morpho liquidation — the loan-token-denominated variant
 *  of the shared two-leg block (Morpho prices in the loan token by design; no
 *  USD is asserted anywhere). Seized = |assetsDelta| (the Liquidate log's
 *  seizedAssets) valued at the market's OWN oracle price captured at the block
 *  (mig 112); cleared = loanRepaid (repaid + any bad debt), already loan
 *  units. The premium reproduces the market's Liquidation Incentive Factor as
 *  realized. Undefined until the block is priced; token-only meanwhile. */
function buildMorphoLiqForensics(
  ctx: MorphoContext,
  coords: MorphoCoords,
  flows: AssetFlow[] | undefined,
): LiquidationForensicsProps | undefined {
  const price = ctx.oraclePriceAtBlock;
  const seizedAmt = Math.abs(Number(ctx.assetsDelta));
  const clearedAmt = Number(ctx.loanRepaid);
  if (!price || !Number.isFinite(seizedAmt) || !Number.isFinite(clearedAmt) || seizedAmt <= 0 || clearedAmt <= 0)
    return undefined;
  const collSym = ctx.collateralSymbol;
  const loanSym = ctx.loanSymbol;
  const seizedValue = seizedAmt * price.loanPerCollateral;
  const inLoan = (n: number) => `${formatNumber(n)} ${loanSym}`;
  return {
    seized: {
      symbol: collSym,
      usd: seizedValue,
      usdProv: liqSeizedValueProv(collSym, loanSym, coords, {
        amount: fmt(String(seizedAmt)),
        price: price.loanPerCollateral,
      }),
    },
    cleared: {
      symbol: loanSym,
      usd: clearedAmt,
      usdProv: liqClearedValueProv(loanSym, coords, { amount: fmt(String(clearedAmt)) }),
    },
    premium: seizedValue / clearedAmt - 1,
    premiumProv: liqPremiumProv(loanSym, coords, { seized: inLoan(seizedValue), cleared: inLoan(clearedAmt) }),
    pricePills: [
      {
        symbol: collSym,
        address: soleFlowAddress(flows, collSym),
        priceUsd: price.loanPerCollateral,
        priceProv: atBlockOraclePriceProv(collSym, loanSym, coords, price.loanPerCollateral),
        note: "market oracle at block",
      },
    ],
    // Everything on this card is loan-token denominated — Morpho's own unit.
    format: { value: inLoan, price: inLoan },
  };
}

export function MorphoEventDetail({ ctx, txHash, blockNumber, flows }: MorphoEventDetailProps) {
  const coords: MorphoCoords = {
    txHash,
    blockNumber,
    marketId: ctx.marketId,
    chainId: useChainId(),
    source: useCaptureSource(),
  };
  // The address for each axis, read off the event's own flows under the
  // single-match rule (soleFlowAddress): a symbol two flows share resolves to
  // nothing rather than to whichever contract happened to come first. Only the
  // side this event actually moved has a flow to name, so the untouched axis —
  // dimmed here anyway — keeps whatever the house table can make of its symbol.
  const collAddr = soleFlowAddress(flows, ctx.collateralSymbol);
  const loanAddr = soleFlowAddress(flows, ctx.loanSymbol);
  const collActive = ctx.side === "collateral" || ctx.eventType === "liquidation";
  const borrActive = ctx.eventType === "borrow" || ctx.eventType === "repay" || ctx.eventType === "liquidation";

  // Only the axis this event's single `assetsDelta` describes (ctx.side) gets a
  // reconstructed before — on a liquidation both sides move but only that side
  // has a clean asset delta (the other's change is in shares, not assets).
  const stats: ChainTruthStat[] = [
    {
      label: "Collateral",
      value: fmt(ctx.collateralAfter),
      symbol: ctx.collateralSymbol,
      address: collAddr,
      prov: collateralAfterProv(ctx.collateralSymbol, coords),
      dimmed: !collActive,
      transition:
        ctx.side === "collateral"
          ? reconstructTransition({
              after: ctx.collateralAfter,
              change: ctx.assetsDelta,
              changeProv: assetsDeltaProv(ctx.collateralSymbol, "collateral", coords, ctx.eventType),
              beforeProv: collateralBeforeProv(ctx.collateralSymbol, coords),
            })
          : undefined,
    },
    {
      label: "Borrowed",
      value: fmt(ctx.borrowedAfter),
      symbol: ctx.loanSymbol,
      address: loanAddr,
      prov: borrowedAfterProv(ctx.loanSymbol, coords),
      dimmed: !borrActive,
      // Gated on the debt axis actually moving: a lender-side supply or
      // withdraw also rides `side: "loan"`, and its delta belongs to the
      // supplied axis below, not to the borrowed one.
      transition:
        ctx.side === "loan" && borrActive
          ? reconstructTransition({
              after: ctx.borrowedAfter,
              change: ctx.assetsDelta,
              changeProv: assetsDeltaProv(ctx.loanSymbol, "loan", coords, ctx.eventType),
              beforeProv: borrowedBeforeProv(ctx.loanSymbol, coords),
            })
          : undefined,
    },
  ];

  // The lender axis — present only where the feeding lane replays it (the
  // swept Base reader sets `suppliedAfter` on supply/withdraw rows; the index
  // carries no lender rows and never does). The Ethereum grid is unchanged.
  if (ctx.suppliedAfter != null) {
    stats.push({
      label: "Supplied",
      value: fmt(ctx.suppliedAfter),
      symbol: ctx.loanSymbol,
      address: loanAddr,
      prov: suppliedAfterProv(ctx.loanSymbol, coords),
      dimmed: false,
      transition: reconstructTransition({
        after: ctx.suppliedAfter,
        change: ctx.assetsDelta,
        changeProv: assetsDeltaProv(ctx.loanSymbol, "loan", coords, ctx.eventType),
        beforeProv: suppliedBeforeProv(ctx.loanSymbol, coords),
      }),
    });
  }

  const forensics = ctx.eventType === "liquidation" ? buildMorphoLiqForensics(ctx, coords, flows) : undefined;

  return (
    <>
      <ChainTruthDetail stats={stats} />
      {forensics && <LiquidationForensics {...forensics} />}
    </>
  );
}
