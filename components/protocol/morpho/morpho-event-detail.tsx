"use client";

// Morpho event detail (chain-state tier) — adapter onto the shared
// ChainTruthDetail grid. The position's collateral after this event, replayed
// from the deltas, and its debt: the borrow shares at the market's totals at the
// row where the answer carries it (Ethereum, and the Base index), the borrowed
// principal otherwise (the Base sweep). On Base the supply likewise. Each value traces via <Prov>. The side this event
// didn't touch is muted.

import type { AssetFlow, MorphoContext } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, reconstructTransition, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { LiquidationForensics, type LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import {
  collateralAfterProv,
  borrowedAfterProv,
  assetsDeltaProv,
  collateralBeforeProv,
  borrowedBeforeProv,
  debtAfterProv,
  debtBeforeProv,
  debtChangeProv,
  interestSincePreviousProv,
  suppliedAfterProv,
  suppliedBeforeProv,
  supplyAfterProv,
  supplyBeforeProv,
  supplyChangeProv,
  supplyGapSincePreviousProv,
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
/** A running balance the answer did not carry is stated, never filled in. */
const fmtAfter = (human: string | undefined): string => (human == null ? "Not loaded" : fmt(human));

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
  // muted here anyway — keeps whatever the house table can make of its symbol.
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
      value: fmtAfter(ctx.collateralAfter),
      symbol: ctx.collateralSymbol,
      address: collAddr,
      prov: collateralAfterProv(ctx.collateralSymbol, coords),
      changed: collActive,
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
    ctx.debtAfter != null
      ? {
          // What the position owed: shares × the market's totals at the row.
          // Before = after − change, the change being debt after − debt before;
          // the gap from the previous row's after is the interest between.
          label: "Debt",
          value: fmt(ctx.debtAfter),
          symbol: ctx.loanSymbol,
          address: loanAddr,
          prov: debtAfterProv(ctx.loanSymbol, coords),
          changed: borrActive || Boolean(ctx.interestSincePrevious),
          transition: borrActive
            ? reconstructTransition({
                after: ctx.debtAfter,
                change: ctx.debtChange,
                changeProv: debtChangeProv(ctx.loanSymbol, coords),
                beforeProv: debtBeforeProv(ctx.loanSymbol, coords),
              })
            : undefined,
          ...(ctx.interestSincePrevious
            ? {
                interestSincePrevious: {
                  value: ctx.interestSincePrevious,
                  prov: interestSincePreviousProv(ctx.loanSymbol, coords),
                },
              }
            : {}),
        }
      : {
          label: "Borrowed",
          value: fmtAfter(ctx.borrowedAfter),
          symbol: ctx.loanSymbol,
          address: loanAddr,
          prov: borrowedAfterProv(ctx.loanSymbol, coords),
          changed: borrActive,
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

  // The lender axis — Base only, whose rows include Supply and Withdraw; the
  // Ethereum index carries no lender rows. The Ethereum grid is unchanged.
  const lenderActive = ctx.eventType === "supply" || ctx.eventType === "withdraw";
  if (ctx.suppliedAfter != null && ctx.supplyBefore != null) {
    // The chain's supply: shares × the market's totals at the row (Base index).
    // The gap from the previous row's after is the interest earned, net of any
    // bad debt socialised between; a loss is named as a change.
    const gap = ctx.supplyGapSincePrevious;
    stats.push({
      label: "Supplied",
      value: fmt(ctx.suppliedAfter),
      symbol: ctx.loanSymbol,
      address: loanAddr,
      prov: supplyAfterProv(ctx.loanSymbol, coords),
      changed: lenderActive || Boolean(gap),
      transition: lenderActive
        ? reconstructTransition({
            after: ctx.suppliedAfter,
            change: ctx.supplyChange,
            changeProv: supplyChangeProv(ctx.loanSymbol, coords),
            beforeProv: supplyBeforeProv(ctx.loanSymbol, coords),
          })
        : undefined,
      ...(gap
        ? {
            interestSincePrevious: {
              value: gap,
              prov: supplyGapSincePreviousProv(ctx.loanSymbol, coords),
              ...(Number(gap) < 0 ? { label: "Change since previous event" } : {}),
            },
          }
        : {}),
    });
  } else if (ctx.suppliedAfter != null) {
    stats.push({
      label: "Supplied",
      value: fmt(ctx.suppliedAfter),
      symbol: ctx.loanSymbol,
      address: loanAddr,
      prov: suppliedAfterProv(ctx.loanSymbol, coords),
      changed: true,
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
