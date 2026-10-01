"use client";

// Fluid event detail — adapter onto the shared ChainTruthDetail grid. The
// lanes an event touches, with before→after transitions:
//   operate      — each leg's balance after the event: the vault's settled
//                  figure read at the block (interest included), with the
//                  interest accrued since the previous event beneath it. A row
//                  whose block the index has not read yet carries the Σ lane
//                  (the position's own deltas + liquidation attributions,
//                  interest-blind between events) and its provenance says so.
//   liquidated / — the SETTLED before→after on both legs: the vault's own
//   absorbed       fetchLatestPosition read at the boundary blocks. These are
//                  the exact numbers (LogLiquidate names no position), plus
//                  the fully-liquidated verdict. Beneath the grid, the valued
//                  forensics block when the vault's oracle price at that block
//                  is captured (mig 114).
//   mint/transfer— the ownership move (from → to), no token amounts.

import type { FluidContext } from "@/lib/shared/types/event-shape";
import {
  ChainTruthDetail,
  reconstructTransition,
  type ChainTruthStat,
  type ChainTruthTransition,
} from "@/components/shared/chain-truth-event";
import { LiquidationForensics, type LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import {
  colDeltaProv,
  debtDeltaProv,
  colAfterProv,
  debtAfterProv,
  colBeforeProv,
  debtBeforeProv,
  liqSettledProv,
  liqImpactProv,
  fullyLiquidatedProv,
  ownerProv,
  atBlockOraclePriceProv,
  liqSeizedValueProv,
  liqClearedValueProv,
  liqPremiumProv,
  liqPenaltyAtBlockProv,
  interestSincePreviousProv,
  type FluidCoords,
} from "@/lib/fluid/event-provenance";
import { pairLabel, shortAddress } from "@/lib/fluid/asset-catalog";
import { formatNumber, formatCompact, formatExact } from "@/lib/utils/format";
import { fmtHeaderMagnitude } from "@/lib/shared/header-values";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { useFluidLedgerCells } from "./fluid-ledger";

export interface FluidEventDetailProps {
  ctx: FluidContext;
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
  /** On an Open row: the holder the NFT was minted to, shown beside the
   *  position's state after its first operation. */
  mintedTo?: string;
  /** The row opens the position (the operate shares its transaction with the
   *  mint), so each leg's "before" is 0. */
  opening?: boolean;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

/** Before→after transition where BOTH boundaries are the settled reads (the
 *  liquidation-attribution rows) — no reconstruction: the change is the exact
 *  difference of the two eth_call figures. */
function settledTransition(
  side: "collateral" | "debt",
  sym: string,
  before: string | undefined,
  after: string | undefined,
  coords: FluidCoords,
): ChainTruthTransition | undefined {
  if (before == null || after == null) return undefined;
  const beforeN = Number(before);
  const afterN = Number(after);
  if (!Number.isFinite(beforeN) || !Number.isFinite(afterN) || beforeN === afterN) return undefined;
  const changeN = afterN - beforeN;
  const sign = changeN >= 0 ? "+" : "−";
  return {
    before: formatCompact(beforeN),
    beforeExact: formatExact(beforeN),
    beforeProv: liqSettledProv(side, "before", sym, coords),
    change: `${sign}${formatCompact(Math.abs(changeN))}`,
    changeExact: `${sign}${formatExact(Math.abs(changeN))}`,
    changeProv: liqImpactProv(side, sym, coords),
  };
}

/** The valued two-leg breakdown, in the vault's own debt token — the Morpho
 *  loan-token mold, because Fluid's shape is the same one: a vault oracle
 *  quotes the collateral IN THE DEBT TOKEN and the protocol runs no USD feed
 *  anywhere, so debt units are not a fallback but the exact space the engine
 *  judges in. One price pill, not two: the cleared leg IS the unit.
 *
 *  Both legs are the settled impacts (the vault's fetchLatestPosition read at
 *  B−1 minus the read at B) rather than emitted log fields — Fluid's
 *  LogLiquidate sweeps tick ranges and names no position.
 *
 *  Undefined until the filler has priced this block, on a smart vault (DEX-share
 *  legs carry no oracle in that storage layout), or wherever a leg's decimals
 *  are unknown — the card stays token-only, which is the safe state. */
function buildFluidLiqForensics(ctx: FluidContext, coords: FluidCoords): LiquidationForensicsProps | undefined {
  const price = ctx.oraclePriceAtBlock;
  if (!price) return undefined;
  const colSym = ctx.supplySymbol;
  const debtSym = ctx.borrowSymbol;
  if (!colSym || !debtSym) return undefined;

  // Seized / cleared are the settled impacts: before − after on each leg.
  const seizedAmt = Number(ctx.liqSupplyBefore) - Number(ctx.liqSupplyAfter);
  const clearedAmt = Number(ctx.liqBorrowBefore) - Number(ctx.liqBorrowAfter);
  if (!Number.isFinite(seizedAmt) || !Number.isFinite(clearedAmt) || seizedAmt <= 0 || clearedAmt <= 0)
    return undefined;

  const seizedValue = seizedAmt * price.debtPerCol;
  const inDebt = (n: number) => `${formatNumber(n)} ${debtSym}`;
  const exactCol = formatExact(seizedAmt);
  const exactDebt = formatExact(clearedAmt);

  // An absorb has no liquidator and hands out no bonus — the vault takes the
  // position on itself past its liquidationMaxLimit. So the gap is a margin on
  // the protocol's own book (Comet's absorption precedent), and the vault's
  // liquidationPenalty is NOT the constant it answers to: no reference there.
  const isAbsorb = ctx.eventType === "absorbed";
  const penaltyPct = isAbsorb ? undefined : price.liquidationPenaltyPct;

  return {
    seized: {
      symbol: colSym,
      // In the closed card's compact form, so "Seized 0.1947 ETH" there and
      // "0.1947 ETH ≈ 719.649 USDC" here read as one amount.
      amount: `${fmtHeaderMagnitude(seizedAmt, colSym)} ${colSym}`,
      usd: seizedValue,
      usdProv: liqSeizedValueProv(colSym, debtSym, coords, { amount: exactCol, price: price.debtPerCol }),
    },
    cleared: {
      symbol: debtSym,
      usd: clearedAmt,
      usdProv: liqClearedValueProv(debtSym, coords, { amount: exactDebt }),
    },
    premium: seizedValue / clearedAmt - 1,
    premiumProv: liqPremiumProv(debtSym, coords, {
      seized: inDebt(seizedValue),
      cleared: inDebt(clearedAmt),
      penaltyPct,
    }),
    ...(isAbsorb ? { premiumLabel: "Absorption margin" } : {}),
    ...(penaltyPct != null
      ? {
          premiumReference: {
            label: "vault penalty",
            value: `${penaltyPct.toFixed(2)}%`,
            prov: liqPenaltyAtBlockProv(coords, penaltyPct),
          },
        }
      : {}),
    pricePills: [
      {
        symbol: colSym,
        priceUsd: price.debtPerCol,
        priceProv: atBlockOraclePriceProv(colSym, debtSym, coords, price.debtPerCol, price.oracle, price.source),
        note: "vault oracle at block",
      },
    ],
    format: { value: inDebt, price: inDebt },
  };
}

export function FluidEventDetail({ ctx, txHash, blockNumber, wallet, mintedTo, opening }: FluidEventDetailProps) {
  const supplySym = ctx.supplySymbol ?? "DEX shares";
  const borrowSym = ctx.borrowSymbol ?? "DEX shares";
  const coords: FluidCoords = {
    txHash,
    blockNumber,
    vault: ctx.vault,
    pairLabel: pairLabel(ctx.supplySymbol, ctx.borrowSymbol),
    nftId: ctx.nftId,
    owner: ctx.ownerAt ?? wallet,
  };
  const stats: ChainTruthStat[] = [];
  const chain = ctx.balanceBasis === "chain";
  // The cells that open into the Lifetime flows ledgers, where the page has
  // them; while the model is on its way, the cells that will open stand as
  // placeholder rows.
  const cells = useFluidLedgerCells();
  const focus = useFlowFocus();
  const flowsPending = !!focus && !focus.model;
  const owes = (Number(ctx.debtAfter ?? "0") || 0) > 0 || (Number(ctx.debtBefore ?? "0") || 0) > 0;
  const collLedger = cells != null || flowsPending ? { ledger: "collateral" as const } : {};
  const debtLedger = cells?.debt || (flowsPending && owes) ? { ledger: "debt" as const } : {};
  const interest = (side: "collateral" | "debt", sym: string): Pick<ChainTruthStat, "interestSincePrevious"> => {
    const value = side === "collateral" ? ctx.colInterestSincePrevious : ctx.debtInterestSincePrevious;
    return value != null
      ? { interestSincePrevious: { value, prov: interestSincePreviousProv(side, sym, coords) } }
      : {};
  };

  if (ctx.eventType === "liquidated" || ctx.eventType === "absorbed") {
    // The settled lane: both boundaries are the vault's own fetchLatestPosition
    // reads — exact, partial-liquidation math included.
    stats.push({
      label: "Collateral",
      value: fmt(ctx.liqSupplyAfter),
      symbol: supplySym,
      prov: liqSettledProv("collateral", "after", supplySym, coords),
      transition: settledTransition("collateral", supplySym, ctx.liqSupplyBefore, ctx.liqSupplyAfter, coords),
      ...interest("collateral", supplySym),
      ...collLedger,
    });
    stats.push({
      label: "Debt",
      value: fmt(ctx.liqBorrowAfter),
      symbol: borrowSym,
      prov: liqSettledProv("debt", "after", borrowSym, coords),
      transition: settledTransition("debt", borrowSym, ctx.liqBorrowBefore, ctx.liqBorrowAfter, coords),
      ...interest("debt", borrowSym),
      ...debtLedger,
    });
    stats.push({
      label: "Outcome",
      value: ctx.fullyLiquidated ? "Fully liquidated" : "Partially liquidated",
      symbol: "",
      prov: fullyLiquidatedProv(coords),
    });
  } else if (ctx.eventType === "mint" || ctx.eventType === "transfer") {
    // Ownership move — the factory's ERC721 Transfer parties, no token amounts.
    if (ctx.eventType === "transfer" && ctx.transferFrom) {
      stats.push({
        label: "From",
        value: shortAddress(ctx.transferFrom),
        symbol: "",
        prov: ownerProv(coords, ctx.transferFrom),
      });
    }
    if (ctx.transferTo) {
      stats.push({
        label: ctx.eventType === "mint" ? "Minted to" : "To",
        value: shortAddress(ctx.transferTo),
        symbol: "",
        prov: ownerProv(coords, ctx.transferTo),
      });
    }
  } else {
    // Operate: each leg's balance — a composite touches both. A leg this event
    // didn't move keeps its plain after-value, muted text marking it untouched.
    const colMoved = (Number(ctx.colDelta ?? "0") || 0) !== 0;
    const debtMoved = (Number(ctx.debtDelta ?? "0") || 0) !== 0;
    if (ctx.colAfter != null) {
      stats.push({
        label: "Collateral",
        value: fmt(ctx.colAfter),
        symbol: supplySym,
        prov: colAfterProv(supplySym, coords, ctx.raw?.colAfter, chain),
        changed: colMoved,
        transition: reconstructTransition({
          after: ctx.colAfter,
          change: ctx.colDelta,
          changeProv: colDeltaProv(supplySym, coords, ctx.raw?.colAmt),
          beforeProv: colBeforeProv(supplySym, coords, chain),
          opening,
        }),
        ...interest("collateral", supplySym),
        ...collLedger,
      });
    }
    if (ctx.debtAfter != null) {
      stats.push({
        label: "Debt",
        value: fmt(ctx.debtAfter),
        symbol: borrowSym,
        prov: debtAfterProv(borrowSym, coords, ctx.raw?.debtAfter, chain),
        changed: debtMoved,
        transition: reconstructTransition({
          after: ctx.debtAfter,
          change: ctx.debtDelta,
          changeProv: debtDeltaProv(borrowSym, coords, ctx.raw?.debtAmt),
          beforeProv: debtBeforeProv(borrowSym, coords, chain),
          opening,
        }),
        ...interest("debt", borrowSym),
        ...debtLedger,
      });
    }
  }

  if (mintedTo) {
    stats.push({
      label: "Minted to",
      value: shortAddress(mintedTo),
      symbol: "",
      prov: ownerProv(coords, mintedTo),
    });
  }

  const forensics =
    ctx.eventType === "liquidated" || ctx.eventType === "absorbed" ? buildFluidLiqForensics(ctx, coords) : undefined;

  return (
    <>
      <ChainTruthDetail stats={stats} />
      {forensics && <LiquidationForensics {...forensics} />}
    </>
  );
}
