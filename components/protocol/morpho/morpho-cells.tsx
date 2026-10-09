"use client";

// Morpho's T2 (ui-jobs 309 step 8): the card's `cells`, `notes` and `price`
// slots. The position's collateral after this event, replayed from the
// deltas, and its debt: the borrow shares at the market's totals at the row
// where the answer carries it (Ethereum, and the Base index), the borrowed
// principal otherwise (the Base sweep). On Base the supply likewise. Opened,
// the market read at the event's block adds Health factor, LTV and the borrow
// rate, the oracle price in the loan token to the price row (no USD: the
// charter), and a liquidation's forensics under the grid. Each value traces
// via <Prov>; the side this event didn't touch is muted.

import type { ReactNode } from "react";
import type { AssetFlow, MorphoContext } from "@/lib/shared/types/event-shape";
import { reconstructTransition, type ChainTruthTransition } from "@/components/shared/chain-truth-event";
import { useChainTruthCells, type ChainTruthCellStat } from "@/components/shared/chain-truth-cells";
import type { EventCellSpec } from "@/components/shared/event-cells";
import type { EventCardOpened } from "@/components/shared/event-card";
import type { EventCardPrice, EventPriceChip } from "@/components/shared/event-price-row";
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
  liqPriceUsedProv,
  morphoHealthAtEventProv,
  morphoBorrowRateAtBlockProv,
  morphoLifProv,
  type MorphoCoords,
} from "@/lib/morpho/event-provenance";
import { PendingBar } from "@/components/shared/event-ledger";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import {
  useMorphoAtBlock,
  morphoHealthMove,
  morphoLiquidationPrice,
  fmtMorphoAmount,
  fmtMorphoPart,
  fmtMorphoHf,
  fmtMorphoPrice,
  atBlockText,
  subDecimal,
  type MorphoAtBlock,
} from "@/lib/morpho/use-market-at-block";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { formatNumber } from "@/lib/utils/format";

import { useMorphoLedgerCells } from "./morpho-ledger";

const fmt = (human: string): string => formatNumber(Number(human));
/** A running balance the answer did not carry is stated, never filled in. */
const fmtAfter = (human: string | undefined): string => (human == null ? "Not loaded" : fmt(human));

/** "2839.378833" → "2,839.378833": the exact figure grouped as every other
 *  exact figure on the card is, with no digit dropped. */
function groupDecimal(s: string): string {
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(s.trim());
  return m ? `${m[1]}${BigInt(m[2]).toLocaleString("en-US")}${m[3] ?? ""}` : s;
}

/** The transition at the row's precision: the before is the row's own exact
 *  figure (never the float after − change), and both figures are written as
 *  the timeline row writes amounts. */
function atPrecision(
  t: ChainTruthTransition | undefined,
  before: string | undefined,
  change: string | undefined,
): ChainTruthTransition | undefined {
  if (!t || before == null || change == null) return t;
  const c = Number(change);
  return {
    ...t,
    before: fmtMorphoAmount(before),
    beforeExact: groupDecimal(before),
    change: `${c >= 0 ? "+" : "−"}${fmtMorphoAmount(Math.abs(c))}`,
    shownAsIs: true,
  };
}

/** The forensics for a Morpho liquidation — the loan-token-denominated variant
 *  of the shared two-leg block (Morpho prices in the loan token by design; no
 *  USD is asserted anywhere). Seized = |assetsDelta| (the Liquidate log's
 *  seizedAssets) valued at the oracle price the liquidation ran on
 *  (morphoLiquidationPrice); cleared = loanRepaid (repaid + any bad debt),
 *  already loan units. The premium then reproduces the market's incentive,
 *  shown beneath it. Undefined until the price is in hand. */
function buildMorphoLiqForensics(
  ctx: MorphoContext,
  coords: MorphoCoords,
  flows: AssetFlow[] | undefined,
  read: MorphoAtBlock,
): LiquidationForensicsProps | undefined {
  const used = morphoLiquidationPrice(ctx, read, coords.blockNumber);
  const seizedAmt = Math.abs(Number(ctx.assetsDelta));
  const clearedAmt = Number(ctx.loanRepaid);
  if (!used || !Number.isFinite(seizedAmt) || !Number.isFinite(clearedAmt) || seizedAmt <= 0 || clearedAmt <= 0)
    return undefined;
  const price = used.price;
  const collSym = ctx.collateralSymbol;
  const loanSym = ctx.loanSymbol;
  const seizedValue = seizedAmt * price;
  const inLoan = (n: number) => `${fmtMorphoAmount(n)} ${loanSym}`;
  const priceBlock = used.block;
  return {
    seized: {
      symbol: collSym,
      usd: seizedValue,
      amount: `${fmtMorphoAmount(seizedAmt)} ${collSym}`,
      usdProv: liqSeizedValueProv(collSym, loanSym, coords, {
        amount: fmt(String(seizedAmt)),
        price,
      }),
    },
    cleared: {
      symbol: loanSym,
      usd: clearedAmt,
      usdProv: liqClearedValueProv(loanSym, coords, { amount: fmt(String(clearedAmt)) }),
    },
    seizedLabel: "Collateral seized",
    clearedLabel: "Debt cleared",
    premium: seizedValue / clearedAmt - 1,
    premiumProv: liqPremiumProv(loanSym, coords, { seized: inLoan(seizedValue), cleared: inLoan(clearedAmt) }),
    ...(used.lif != null && read.status === "ok"
      ? {
          premiumReference: {
            label: "Market incentive",
            value: `+${((used.lif - 1) * 100).toFixed(2)}%`,
            prov: morphoLifProv(coords, read.lltv, used.lif),
          },
        }
      : {}),
    pricePills: [
      {
        symbol: collSym,
        address: soleFlowAddress(flows, collSym),
        priceUsd: price,
        priceProv:
          priceBlock != null
            ? liqPriceUsedProv(collSym, loanSym, coords, price, priceBlock)
            : atBlockOraclePriceProv(collSym, loanSym, coords, price),
        note: priceBlock != null ? `market oracle at ${atBlockText(priceBlock, used.time)}` : "market oracle",
      },
    ],
    // Everything on this card is loan-token denominated — Morpho's own unit.
    format: { value: inLoan, price: (n: number) => `${fmtMorphoPrice(n)} ${loanSym}` },
  };
}

/** A cell held while the market read is in flight. */
const pendingCell = (key: string, label: string, inputs?: string[]): EventCellSpec => ({
  kind: "stat",
  key,
  label,
  changed: false,
  ...(inputs ? { inputs } : {}),
  value: { after: { text: <PendingBar /> } },
});

/** The position's cells: Collateral, Debt (or Borrowed), Supplied. */
export function useMorphoCells(
  ctx: MorphoContext,
  coords: MorphoCoords,
  flows: AssetFlow[] | undefined,
): EventCellSpec[] {
  // Which cells open into the Lifetime flows ledgers, where the page has them.
  const cells = useMorphoLedgerCells();
  // The page ties its timeline to the flows panel and the model has not landed:
  // the cells that will open into ledgers stand as placeholder rows meanwhile.
  const focus = useFlowFocus();
  const flowsPending = !!focus && !focus.model;
  const lenderEv = ctx.eventType === "supply" || ctx.eventType === "withdraw";
  // The address for each axis, read off the event's own flows under the
  // single-match rule (soleFlowAddress): a symbol two flows share resolves to
  // nothing rather than to whichever contract happened to come first. Only the
  // side this event moved has a flow to name, so the untouched axis keeps
  // whatever the house table can make of its symbol.
  const collAddr = soleFlowAddress(flows, ctx.collateralSymbol);
  const loanAddr = soleFlowAddress(flows, ctx.loanSymbol);
  const collActive = ctx.side === "collateral" || ctx.eventType === "liquidation";
  const borrActive = ctx.eventType === "borrow" || ctx.eventType === "repay" || ctx.eventType === "liquidation";

  // Only the axis this event's single `assetsDelta` describes (ctx.side) gets a
  // reconstructed before — on a liquidation both sides move but only that side
  // has a clean asset delta (the other's change is in shares, not assets).
  const stats: ChainTruthCellStat[] = [
    {
      key: "collateral",
      label: "Collateral",
      value: fmtAfter(ctx.collateralAfter),
      symbol: ctx.collateralSymbol,
      address: collAddr,
      prov: collateralAfterProv(ctx.collateralSymbol, coords),
      changed: collActive,
      display: ctx.collateralAfter != null ? fmtMorphoAmount(ctx.collateralAfter) : undefined,
      ...(cells?.collateral === "collateral" || (flowsPending && !lenderEv) ? { ledger: "collateral" as const } : {}),
      transition:
        ctx.side === "collateral"
          ? atPrecision(
              reconstructTransition({
                after: ctx.collateralAfter,
                change: ctx.assetsDelta,
                changeProv: assetsDeltaProv(ctx.collateralSymbol, "collateral", coords, ctx.eventType),
                beforeProv: collateralBeforeProv(ctx.collateralSymbol, coords),
              }),
              ctx.collateralAfter != null ? subDecimal(ctx.collateralAfter, ctx.assetsDelta) : undefined,
              ctx.assetsDelta,
            )
          : undefined,
    },
    ctx.debtAfter != null
      ? {
          // What the position owed: shares × the market's totals at the row.
          // Before = after − change, the change being debt after − debt before;
          // the gap from the previous row's after is the interest between.
          key: "debt",
          label: "Debt",
          value: fmt(ctx.debtAfter),
          display: fmtMorphoAmount(ctx.debtAfter),
          ...(cells?.debt || (flowsPending && !lenderEv) ? { ledger: "debt" as const } : {}),
          symbol: ctx.loanSymbol,
          address: loanAddr,
          prov: debtAfterProv(ctx.loanSymbol, coords),
          changed: borrActive || Boolean(ctx.interestSincePrevious),
          transition: borrActive
            ? atPrecision(
                reconstructTransition({
                  after: ctx.debtAfter,
                  change: ctx.debtChange,
                  changeProv: debtChangeProv(ctx.loanSymbol, coords),
                  beforeProv: debtBeforeProv(ctx.loanSymbol, coords),
                }),
                ctx.debtBefore,
                ctx.debtChange,
              )
            : undefined,
          ...(ctx.interestSincePrevious
            ? {
                interestSincePrevious: {
                  value: ctx.interestSincePrevious,
                  display: fmtMorphoPart(ctx.interestSincePrevious, ctx.debtBefore ?? ctx.debtAfter),
                  prov: interestSincePreviousProv(ctx.loanSymbol, coords),
                },
              }
            : {}),
        }
      : {
          key: "debt",
          label: "Borrowed",
          value: fmtAfter(ctx.borrowedAfter),
          symbol: ctx.loanSymbol,
          address: loanAddr,
          prov: borrowedAfterProv(ctx.loanSymbol, coords),
          changed: borrActive,
          // Gated on the debt axis moving: a lender-side supply or withdraw
          // also rides `side: "loan"`, and its delta belongs to the supplied
          // axis below.
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
  // Ethereum index carries no lender rows.
  if (ctx.suppliedAfter != null && ctx.supplyBefore != null) {
    // The chain's supply: shares × the market's totals at the row (Base index).
    // The gap from the previous row's after is the interest earned, net of any
    // bad debt socialised between; a loss is named as a change.
    const gap = ctx.supplyGapSincePrevious;
    stats.push({
      key: "supplied",
      label: "Supplied",
      value: fmt(ctx.suppliedAfter),
      symbol: ctx.loanSymbol,
      address: loanAddr,
      prov: supplyAfterProv(ctx.loanSymbol, coords),
      ...(cells?.collateral === "supply" || (flowsPending && lenderEv) ? { ledger: "collateral" as const } : {}),
      changed: lenderEv || Boolean(gap),
      transition: lenderEv
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
      key: "supplied",
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
  return useChainTruthCells(stats);
}

/** The opened card: the market read at the event's block adds Health factor,
 *  LTV and the market borrow rate (a cell holds its place while the read is in
 *  flight; a failed read draws none), the oracle price in the loan token to
 *  the price row, and a liquidation's forensics under the grid. */
export function useMorphoOpened(
  ctx: MorphoContext,
  coords: MorphoCoords,
  flows: AssetFlow[] | undefined,
  cells: EventCellSpec[],
  price: EventCardPrice | undefined,
): EventCardOpened {
  const read = useMorphoAtBlock(ctx.marketId, coords.blockNumber, coords.chainId ?? 1);
  const lender = ctx.eventType === "supply" || ctx.eventType === "withdraw";
  const debtSide = ctx.eventType === "borrow" || ctx.eventType === "repay";
  const anyDebt = Number(ctx.debtBefore ?? 0) > 1e-6 || Number(ctx.debtAfter ?? ctx.borrowedAfter ?? 0) > 1e-6;
  const risk = !lender && anyDebt && ctx.debtAfter != null;
  const collSym = ctx.collateralSymbol;
  const loanSym = ctx.loanSymbol;
  const move = morphoHealthMove(ctx, read, coords.blockNumber);
  const inputs = ["collateral", "debt"];

  const riskCells: EventCellSpec[] = [];
  if (risk && read.status === "loading") {
    riskCells.push(pendingCell("health", "Health factor", inputs), pendingCell("ltv", "LTV", inputs));
    if (debtSide) riskCells.push(pendingCell("rate", "Market borrow rate"));
  } else if (risk && read.status === "ok" && move) {
    const vals = (side: "before" | "after") => ({
      collateral: String(side === "before" ? move.collBefore : move.collAfter),
      debt: String(side === "before" ? move.debtBefore : move.debtAfter),
      price: move.price,
      priceBlock: move.priceBlock,
      lltv: move.lltv,
      liquidation: move.liquidationPrice,
    });
    const hfText = (hf: number | null) => (hf == null ? "no debt" : fmtMorphoHf(hf));
    const ltvText = (l: number | null) =>
      l == null ? "no debt" : l > 0 && l < 0.001 ? "<0.1%" : `${(l * 100).toFixed(1)}%`;
    const pair = (
      key: string,
      label: string,
      what: "health factor" | "LTV",
      before: string,
      after: string,
      sub?: ReactNode,
    ): EventCellSpec => ({
      kind: "stat",
      key,
      label,
      changed: before !== after,
      inputs,
      value: {
        ...(before !== after
          ? {
              before: {
                text: before,
                info: morphoHealthAtEventProv(what, "before", collSym, loanSym, coords, vals("before")),
              },
            }
          : {}),
        after: { text: after, info: morphoHealthAtEventProv(what, "after", collSym, loanSym, coords, vals("after")) },
      },
      ...(sub ? { sub: [{ content: sub }] } : {}),
    });
    riskCells.push(
      pair(
        "health",
        "Health factor",
        "health factor",
        hfText(move.hfBefore),
        hfText(move.hfAfter),
        <>
          at the market oracle at {atBlockText(move.priceBlock, move.priceBlockTime)}
          {move.liquidationPrice ? ": the price the liquidation ran at" : ""}
        </>,
      ),
      pair(
        "ltv",
        `LTV (liquidation at ${(move.lltv * 100).toFixed(1)}%)`,
        "LTV",
        ltvText(move.ltvBefore),
        ltvText(move.ltvAfter),
      ),
    );
    const apr = read.at.borrowApr;
    if (debtSide && apr != null)
      riskCells.push({
        kind: "stat",
        key: "rate",
        label: "Market borrow rate",
        changed: false,
        value: {
          after: {
            text: `${(apr * 100).toFixed(2)}% APR`,
            info: morphoBorrowRateAtBlockProv(coords, read.at.block, apr),
          },
        },
        sub: [
          {
            content: (
              <>
                at the end of {atBlockText(read.at.block, read.at.timestamp)}; it moves with the market&rsquo;s
                utilization, the share of its supplied {loanSym} that is lent out
              </>
            ),
          },
        ],
      });
  }

  // The collateral's price in the loan token (Morpho's unit; no USD), where
  // the cells value collateral.
  const chip: EventPriceChip | null =
    !lender && move
      ? {
          symbol: collSym,
          address: soleFlowAddress(flows, collSym),
          usd: move.price,
          unit: { format: (n) => `${fmtMorphoPrice(n)} ${loanSym}` },
          named: { note: `market oracle at ${atBlockText(move.priceBlock, move.priceBlockTime)}` },
          info: move.liquidationPrice
            ? liqPriceUsedProv(collSym, loanSym, coords, move.price, move.priceBlock)
            : atBlockOraclePriceProv(collSym, loanSym, coords, move.price),
          value: String(move.price),
        }
      : null;

  const forensics = ctx.eventType === "liquidation" ? buildMorphoLiqForensics(ctx, coords, flows, read) : undefined;
  return {
    cells: [...cells, ...riskCells],
    // The forensics' price pill gives way to the price row's chip.
    notes: forensics ? (
      <LiquidationForensics {...forensics} pricePills={chip ? [] : forensics.pricePills} />
    ) : undefined,
    price: chip ? { gas: price?.gas, prices: [...(price?.prices ?? []), chip], figures: price?.figures } : price,
  };
}
