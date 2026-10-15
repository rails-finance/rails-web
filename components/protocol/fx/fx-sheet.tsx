"use client";

// f(x)'s event card as a balance sheet (ui-jobs 330): the shell's `sheet` slot,
// filled from the figures the opened card's cells state: getPosition and
// getPositionDebtRatio at block − 1 and at the block (/api/chain/fx/event-state).
//
// Collateral is in the pool's normalized unit (stETH / WBTC) at the oracle's
// price at the block; Debt is fxUSD counted at $1. The page has the previous
// event's debt as the move since it (`debtSincePrevious`), so the Debt
// breakdown holds "Last event", the pool's move since it and "Before this
// event". Where the page hands down the previous event (`prev`), Collateral
// holds "Last event" at that event's price, what the pool moved since, the
// "Market move" between the two prices and "Before this event"; the price to
// the tick swaps to its change since. Neither side draws "Interest since last
// event" (a position's debt accrues no interest: the pool moves it through
// rebalances and shared bad debt).
//
// Risk: the debt ratio and the price at which the position's tick reaches the
// rebalance line. Limits: the pool's drift since the previous event, with the
// pool's rebalance and liquidation lines as parameters. The protocol fee stays
// in the price row and a liquidation's split in the notes under the sheet.
// The read starts when the card opens (`active`); the sheet is null until it
// lands, and undefined where the row has no balance to state (the cells stand).

import type { FxContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import {
  SHEET_WORDS,
  sheetUsd,
  type EventSheet,
  type SheetPanel,
  type SheetRow,
  type SheetSide,
  type SheetStat,
} from "@/components/shared/event-sheet";
import { changeText } from "@/components/shared/change-swap-value";
import {
  chainBeforeProv,
  chainChangeProv,
  debtSincePreviousProv,
  fxPositionUsdProv,
  minTriggerPriceProv,
  poolLineProv,
  rowChangeProv,
  rowStateProv,
  snapOraclePriceProv,
  type FxCoords,
} from "@/lib/fx/event-provenance";
import { FX_POOLS, FXUSD_META, isFxPoolKey } from "@/lib/fx/asset-catalog";
import { fxBeforeAfter, useFxEventStateRead } from "@/lib/fx/use-event-state";
import { formatExact, formatNumber } from "@/lib/utils/format";
import { FX_DUST_USD } from "./fx-cells";

/** The rows' read-more, one sentence each. */
const TIPS = {
  collBefore: "The collateral the position held just before this event, from the pool at the block before.",
  collOperate:
    "The collateral this event added or took, the pool's balance after less the balance before, including any funding the pool booked at the start of the transaction.",
  collFunding:
    "The collateral the pool took as funding at the start of this transaction, the pool's balance after less the balance before.",
  collRebalance:
    "The collateral a keeper took from the position's tick, the pool's balance before less the balance after, bonus included.",
  collRedemption:
    "The collateral given up to a redeemer from the position's tick, the pool's balance before less the balance after.",
  collLiquidation:
    "The collateral a keeper took from the position, the pool's balance before less the balance after, bonus included.",
  collTotal: "The collateral held after this event, in dollars at the oracle's price at this block.",
  collLast: "The collateral the position held after its previous event, in dollars at the oracle's price then.",
  collMoved:
    "The collateral the pool moved on this position since the previous event, through funding and rebalances, at the oracle's price at this block.",
  collMarket:
    "The change the oracle's price made to the dollar value of the collateral held between the previous event and this one.",
  debtLast: "The debt at the previous event: the debt just before this event less what the pool moved since.",
  debtLastRead:
    "The debt after the previous event, from the pool at that event's block, counting one fxUSD as one dollar.",
  debtMoved:
    "The debt the pool moved since the previous event through rebalances, redemptions and bad debt shared across the pool.",
  debtBefore: "The debt just before this event, from the pool at the block before, counting one fxUSD as one dollar.",
  debtOperate: "The debt this event drew or repaid, the pool's debt after less the debt before.",
  debtRebalance: "The debt a keeper's rebalance cleared from the position's tick, the pool's debt before less after.",
  debtRedemption: "The debt a redemption cleared from the position's tick, the pool's debt before less after.",
  debtLiquidation:
    "The debt the liquidation cleared, the pool's debt before less after, including any the pool wrote off onto other positions.",
  debtTotal: "The debt after this event, from the pool at this block, counting one fxUSD as one dollar.",
  ratio:
    "The position's debt over the value of its collateral, from the pool's debt ratio at this block. The higher it is, the closer the position is to a rebalance.",
  priceToTick:
    "The collateral price at which this position's tick reaches the pool's rebalance line, holding its collateral and debt where they are after this event.",
  drift:
    "The debt the pool moved since the previous event: the debt just before this event less the debt at the previous one.",
  rebalanceRatio: "The debt ratio from which a keeper may rebalance a tick, read from the pool at this block.",
  liquidationRatio: "The debt ratio from which a keeper may liquidate a position, read from the pool at this block.",
};

const UNREAD = "Not read on this page";
const DUST_COLL = 1e-6;
const DUST_DEBT = 0.005;
const pctText = (r: number): string => `${(r * 100).toFixed(1)}%`;
const lineText = (r: number): string => `${Number((r * 100).toFixed(2))}%`;
const signedNum = (n: number): string => (n < 0 ? `−${formatNumber(Math.abs(n))}` : formatNumber(n));

/** fxUSD valued at its face. */
const faceProv = (what: string, coords: FxCoords): Provenance => ({
  kind: "derived",
  summary: `${what} in dollars: the fxUSD amount counted at $1, one fxUSD as one dollar. The dollar figure is not a market quote.`,
  formula: "fxUSD × $1",
  inputs:
    coords.blockNumber != null ? [{ label: "block", value: String(coords.blockNumber), kind: "chain" }] : undefined,
});

/** A collateral amount at the oracle's price at the block. */
const collUsdProv = (sym: string, amount: number, price: number, coords: FxCoords, at?: string): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `${sym} in dollars: the amount times the pool oracle's price per ${sym}${at ? ` ${at}` : coords.blockNumber != null ? ` at block ${coords.blockNumber}` : ""}.`,
  formula: "amount × price",
  inputs: [
    { label: "amount", value: `${formatNumber(Math.abs(amount))} ${sym}`, kind: "chain" },
    { label: "price", value: sheetUsd(price), kind: "chain-derived", pclass: "oracle" },
  ],
});

/** The collateral the previous event left, as its row read it. */
const prevCollProv = (sym: string, amount: number, coords: FxCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `Collateral at the previous event (${sym}) — getPosition's collateral at that event's block, in the pool's normalized unit.`,
  contract: { name: "AaveFundingPool", address: coords.pool },
  inputs: [{ label: "collateral", value: `${formatExact(amount)} ${sym}`, kind: "chain", pclass: "state" }],
});

const debtLastProv = (coords: FxCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `fxUSD debt at the position's previous event: getPosition's debt just before this event${coords.blockNumber != null ? ` (block ${coords.blockNumber - 1})` : ""} less the debt the pool moved since.`,
  formula: "debt before − moved since the previous event",
  contract: { name: "AaveFundingPool", address: coords.pool },
  inputs: [{ label: "moved since the previous event", kind: "chain-derived", pclass: "state" }],
});

export interface FxSheetArgs {
  ctx: FxContext;
  txHash?: string;
  blockNumber?: number;
  /** The pool's rate-normalized unit symbol (stETH / WBTC). */
  normalizedSymbol: string;
  /** Rebalance rows: how many rebalance rows of this position share the block. */
  blockPeers?: number;
  /** The card is open: the read starts. */
  active: boolean;
  /** The position's previous event with a read position. */
  prev?: FxContext;
}

/** The card's sheet: null while the position's read is on its way, undefined
 *  where the row states no balance (an ownership transfer, or a read that
 *  missed), a sheet once it stands. */
export function useFxSheet({
  ctx,
  txHash,
  blockNumber,
  normalizedSymbol,
  blockPeers,
  active,
  prev,
}: FxSheetArgs): EventSheet | null | undefined {
  const { value: state, settled } = useFxEventStateRead(ctx, active ? blockNumber : undefined, txHash);
  if (ctx.eventType === "transfer") return undefined;
  if (!active || !settled) return null;
  const { before, after } = fxBeforeAfter(state, blockNumber);
  const meta = isFxPoolKey(ctx.pool) ? FX_POOLS[ctx.pool] : undefined;
  const coords: FxCoords = {
    txHash,
    blockNumber,
    pool: meta?.address,
    poolLabel: ctx.poolSymbol,
    positionId: ctx.positionId,
  };
  const opened = ctx.eventType === "operate" && ctx.isOpen === true;
  const num = (s?: string): number | null => (s != null ? Number(s) : null);
  const collAfter = after?.colls ?? num(ctx.collAfter);
  const debtAfter = after?.debts ?? num(ctx.debtAfter);
  const collBefore = opened ? 0 : (before?.colls ?? num(ctx.collBefore));
  const debtBefore = opened ? 0 : (before?.debts ?? num(ctx.debtBefore));
  if (collAfter == null || debtAfter == null || collBefore == null || debtBefore == null) return undefined;
  const read = after != null && (opened || before != null);
  const price = ctx.oraclePrice != null ? Number(ctx.oraclePrice) : (after?.minPrice ?? null);
  const priceProv =
    ctx.oraclePrice != null
      ? snapOraclePriceProv(normalizedSymbol, coords, ctx.oraclePrice)
      : fxPositionUsdProv(normalizedSymbol, blockNumber);
  const since = ctx.debtSincePrevious != null ? Number(ctx.debtSincePrevious) : null;

  const kind: "operate" | "liquidation" | "rebalance" | "redemption" =
    ctx.eventType === "tickRebalance"
      ? ctx.redemption
        ? "redemption"
        : "rebalance"
      : ctx.eventType === "liquidation"
        ? "liquidation"
        : "operate";
  const peers = blockPeers != null && blockPeers > 1 ? ` · this block (${blockPeers} rebalances)` : "";
  const tokenSym = meta?.tokenSymbol ?? ctx.poolSymbol;
  const collAddress = normalizedSymbol === tokenSym ? meta?.tokenAddress : undefined;

  // The event's words on each side.
  const collMove = collAfter - collBefore;
  const debtMove = debtAfter - debtBefore;
  const opCollDelta = Number(ctx.collDelta ?? "0") || 0;
  const opDebtDelta = Number(ctx.debtDelta ?? "0") || 0;
  const collWord =
    kind === "operate"
      ? opened
        ? "Deposit"
        : opCollDelta === 0
          ? "Pool funding"
          : opCollDelta > 0
            ? "Add collateral"
            : "Withdraw collateral"
      : kind === "liquidation"
        ? "Taken by the liquidation"
        : kind === "redemption"
          ? `Taken by the redemption${peers}`
          : `Taken by the rebalance${peers}`;
  const debtWord =
    kind === "operate"
      ? opDebtDelta >= 0
        ? "Borrow"
        : "Repay"
      : kind === "liquidation"
        ? "Cleared by the liquidation"
        : kind === "redemption"
          ? `Cleared by the redemption${peers}`
          : `Cleared by the rebalance${peers}`;
  const collTip =
    kind === "operate"
      ? opCollDelta === 0 && !opened
        ? TIPS.collFunding
        : TIPS.collOperate
      : kind === "liquidation"
        ? TIPS.collLiquidation
        : kind === "redemption"
          ? TIPS.collRedemption
          : TIPS.collRebalance;
  const debtTip =
    kind === "operate"
      ? TIPS.debtOperate
      : kind === "liquidation"
        ? TIPS.debtLiquidation
        : kind === "redemption"
          ? TIPS.debtRedemption
          : TIPS.debtRebalance;

  // ── Collateral ──
  const collRows: SheetRow[] = [];
  if (Math.abs(collMove) >= DUST_COLL)
    collRows.push({
      key: "event",
      label: collWord,
      amount: {
        text: signedNum(collMove),
        symbol: normalizedSymbol,
        address: collAddress,
        info: read
          ? rowChangeProv("coll", normalizedSymbol, coords)
          : chainChangeProv("coll", normalizedSymbol, coords),
        value: formatExact(collMove),
      },
      usd:
        price != null && price > 0
          ? { text: sheetUsd(collMove * price), info: collUsdProv(normalizedSymbol, collMove, price, coords) }
          : undefined,
      tip: collTip,
    });
  const collAfterUsd = price != null && price > 0 ? collAfter * price : null;
  // The carry layer from the previous event's position and price.
  const prevColl = !opened && prev?.collAfter != null ? Number(prev.collAfter) : null;
  const prevPrice = prev?.oraclePrice != null ? Number(prev.oraclePrice) : null;
  const prevCoords: FxCoords = { ...coords, txHash: undefined, blockNumber: undefined };
  const collCarry: SheetSide["carry"] = [];
  if (prevColl != null && prevColl > DUST_COLL && prevPrice != null && prevPrice > 0) {
    collCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: {
        text: formatNumber(prevColl),
        symbol: normalizedSymbol,
        address: collAddress,
        info: prevCollProv(normalizedSymbol, prevColl, coords),
        value: formatExact(prevColl),
      },
      usd: {
        text: sheetUsd(prevColl * prevPrice),
        info: collUsdProv(normalizedSymbol, prevColl, prevPrice, prevCoords, "at the previous event"),
      },
      tip: TIPS.collLast,
    });
    const movedColl = collBefore - prevColl;
    if (Math.abs(movedColl) >= DUST_COLL && price != null && price > 0)
      collCarry.push({
        key: "moved",
        label: "Moved by the pool since last event",
        amount: {
          text: signedNum(movedColl),
          symbol: normalizedSymbol,
          address: collAddress,
          info: {
            kind: "chain-derived",
            pclass: "state",
            summary: `Collateral moved by the pool (${normalizedSymbol}) — funding and rebalances since the previous event: the collateral just before this event less the collateral after the previous one.`,
            formula: "collateral before − collateral at the previous event",
            contract: { name: "AaveFundingPool", address: coords.pool },
          },
          value: formatExact(movedColl),
        },
        usd: { text: sheetUsd(movedColl * price), info: collUsdProv(normalizedSymbol, movedColl, price, coords) },
        tip: TIPS.collMoved,
      });
    if (price != null && price > 0) {
      const mv = prevColl * (price - prevPrice);
      if (Math.abs(mv) >= 0.005)
        collCarry.push({
          key: "market",
          label: SHEET_WORDS.market,
          usd: {
            text: sheetUsd(mv, true),
            info: {
              kind: "chain-derived",
              pclass: "oracle",
              summary: `Market move on the collateral since the last event — the ${normalizedSymbol} held at the previous event, valued at the oracle's price at this block less its price at the previous event. No token moved.`,
              formula: "collateral at the previous event × (price now − price then)",
              inputs: [
                { label: "collateral", value: `${formatNumber(prevColl)} ${normalizedSymbol}`, kind: "chain" },
                {
                  label: "price at the previous event",
                  value: sheetUsd(prevPrice),
                  kind: "chain-derived",
                  pclass: "oracle",
                },
                { label: "price at this event", value: sheetUsd(price), kind: "chain-derived", pclass: "oracle" },
              ],
            },
          },
          tip: TIPS.collMarket,
        });
    }
  }
  const collSide: SheetSide = {
    side: "collateral",
    icons: [normalizedSymbol],
    carry: collCarry,
    before:
      collBefore > 0
        ? {
            key: "before",
            label: SHEET_WORDS.before,
            amount: {
              text: formatNumber(collBefore),
              symbol: normalizedSymbol,
              address: collAddress,
              info: read
                ? rowStateProv("coll", "before", normalizedSymbol, coords)
                : chainBeforeProv("coll", normalizedSymbol, coords, false),
              value: formatExact(collBefore),
            },
            usd:
              price != null && price > 0
                ? { text: sheetUsd(collBefore * price), info: collUsdProv(normalizedSymbol, collBefore, price, coords) }
                : undefined,
            tip: TIPS.collBefore,
          }
        : undefined,
    rows: collRows,
    total:
      collAfterUsd != null
        ? { text: collAfter > 0 ? sheetUsd(collAfterUsd) : "$0", info: priceProv }
        : { none: UNREAD },
    totalTip: TIPS.collTotal,
  };

  // ── Debt ──
  const debtRows: SheetRow[] = [];
  if (Math.abs(debtMove) >= DUST_DEBT)
    debtRows.push({
      key: "event",
      label: debtWord,
      amount: {
        text: signedNum(debtMove),
        symbol: FXUSD_META.symbol,
        address: FXUSD_META.address,
        info: read
          ? rowChangeProv("debt", normalizedSymbol, coords)
          : chainChangeProv("debt", normalizedSymbol, coords),
        value: formatExact(debtMove),
      },
      usd: { text: sheetUsd(debtMove), info: faceProv("The debt this event moved", coords) },
      tip: debtTip,
    });
  const debtCarry: SheetSide["carry"] = [];
  if (since != null && !opened && since !== 0) {
    const last = debtBefore - since;
    debtCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: {
        text: formatNumber(last),
        symbol: FXUSD_META.symbol,
        address: FXUSD_META.address,
        info: debtLastProv(coords),
        value: formatExact(last),
      },
      usd: { text: sheetUsd(last), info: faceProv("The debt at the previous event", coords) },
      tip: TIPS.debtLast,
    });
    debtCarry.push({
      key: "moved",
      label: "Moved by the pool since last event",
      amount: {
        text: signedNum(since),
        symbol: FXUSD_META.symbol,
        address: FXUSD_META.address,
        info: debtSincePreviousProv(coords),
        value: formatExact(since),
      },
      usd: { text: sheetUsd(since), info: faceProv("The debt the pool moved", coords) },
      tip: TIPS.debtMoved,
    });
  } else if (!opened && prev?.debtAfter != null && Number(prev.debtAfter) > 0) {
    const last = Number(prev.debtAfter);
    debtCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: {
        text: formatNumber(last),
        symbol: FXUSD_META.symbol,
        address: FXUSD_META.address,
        info: {
          kind: "chain",
          pclass: "state",
          summary: "Debt at the previous event (fxUSD) — getPosition's debt at that event's block.",
          contract: { name: "AaveFundingPool", address: coords.pool },
          inputs: [{ label: "debt", value: `${formatExact(last)} fxUSD`, kind: "chain", pclass: "state" }],
        },
        value: formatExact(last),
      },
      usd: { text: sheetUsd(last), info: faceProv("The debt at the previous event", coords) },
      tip: TIPS.debtLastRead,
    });
  }
  const debtSide: SheetSide = {
    side: "debt",
    icons: [FXUSD_META.symbol],
    carry: debtCarry,
    before:
      debtBefore > 0
        ? {
            key: "before",
            label: SHEET_WORDS.before,
            amount: {
              text: formatNumber(debtBefore),
              symbol: FXUSD_META.symbol,
              address: FXUSD_META.address,
              info: read
                ? rowStateProv("debt", "before", normalizedSymbol, coords)
                : chainBeforeProv("debt", normalizedSymbol, coords, false),
              value: formatExact(debtBefore),
            },
            usd: { text: sheetUsd(debtBefore), info: faceProv("The debt before this event", coords) },
            tip: TIPS.debtBefore,
          }
        : undefined,
    rows: debtRows,
    total: {
      text: debtAfter > 0 ? sheetUsd(debtAfter) : "$0",
      info: faceProv("The debt after this event", coords),
    },
    totalTip: TIPS.debtTotal,
  };

  // ── Risk ──
  const ended = collAfter <= 0 && debtAfter <= 0;
  // Dust is what a liquidation leaves: only its rows test the dollar value.
  const px =
    ctx.eventType === "liquidation"
      ? ctx.poolWide === true
        ? (before?.minPrice ?? null)
        : ctx.oraclePrice != null
          ? Number(ctx.oraclePrice)
          : null
      : null;
  const dust = collAfter > 0 && (collAfter < 1e-9 || (px != null && px > 0 && collAfter * px < FX_DUST_USD));
  const ratio = after?.ratio ?? null;
  const ratioValue: SheetStat["value"] = ended
    ? { none: "Closed" }
    : dust
      ? { text: "dust left", info: rowStateProv("ratio", "after", normalizedSymbol, coords) }
      : debtAfter <= 0
        ? { none: "No debt" }
        : ratio != null
          ? {
              text: pctText(ratio),
              info: rowStateProv("ratio", "after", normalizedSymbol, coords),
              value: formatExact(ratio * 100),
            }
          : { none: UNREAD };
  const rebLine = after?.rebalanceLine ?? null;
  const liqLine = after?.liquidateLine ?? null;
  const tickPrice =
    collAfter > 0 && debtAfter > 0 && rebLine != null && rebLine > 0 ? debtAfter / (collAfter * rebLine) : null;
  const prevDebt = prev?.debtAfter != null ? Number(prev.debtAfter) : null;
  const prevTick =
    prevColl != null && prevColl > 0 && prevDebt != null && prevDebt > 0 && rebLine != null && rebLine > 0
      ? prevDebt / (prevColl * rebLine)
      : null;
  const risk: SheetStat[] = [
    { key: "debt-ratio", label: "Debt ratio", value: ratioValue, tip: TIPS.ratio },
    {
      key: "price-to-tick",
      label: "Price to tick",
      value: ended
        ? { none: "Closed" }
        : dust
          ? { none: "dust left" }
          : debtAfter <= 0
            ? { none: "No debt" }
            : tickPrice != null
              ? {
                  text: sheetUsd(tickPrice),
                  info: minTriggerPriceProv(`the pool's rebalance line, ${lineText(rebLine!)}`, normalizedSymbol),
                  value: formatExact(tickPrice),
                }
              : { none: UNREAD },
      change:
        tickPrice != null && prevTick != null
          ? {
              text: changeText(tickPrice - prevTick, (x) => sheetUsd(x)),
              info: {
                kind: "derived",
                summary:
                  "Price to the tick's change since the previous event — the price after this event less the price on the previous event's collateral and debt, both against the pool's rebalance line at this block.",
                formula: "price now − price at the previous event",
              },
            }
          : null,
      tip: TIPS.priceToTick,
    },
  ];

  // ── Limits ──
  const limits: SheetStat[] = [
    {
      key: "pool-drift",
      label: "Pool drift",
      value:
        since != null && since !== 0
          ? {
              text: `${signedNum(since)} ${FXUSD_META.symbol}`,
              info: debtSincePreviousProv(coords),
              value: formatExact(since),
            }
          : opened
            ? { none: "First event" }
            : { none: "None stated" },
      tip: TIPS.drift,
    },
  ];
  const lineRow = (key: string, label: string, which: "rebalance" | "liquidate", line: number | null, tip: string) => ({
    key,
    label,
    value:
      line != null
        ? { text: lineText(line), info: poolLineProv(which, blockNumber), value: formatExact(line * 100) }
        : { none: UNREAD },
    tip,
  });
  const params: SheetStat[] = [
    lineRow("rebalance-ratio", "Rebalance ratio", "rebalance", rebLine, TIPS.rebalanceRatio),
    lineRow("liquidation-ratio", "Liquidation ratio", "liquidate", liqLine, TIPS.liquidationRatio),
  ];

  const panels: SheetPanel[] = [
    { panel: "risk", rows: risk },
    { panel: "limits", rows: limits, breakdown: params },
  ];
  return { sides: [collSide, debtSide], panels };
}
