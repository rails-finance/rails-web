"use client";

// Liquity V1's event card as a balance sheet (ui-jobs 330): the shell's `sheet`
// slot, filled the way Liquity V2's is (liquity-cells.tsx) from the figures the
// opened card's cells already state. A Trove has ETH collateral and LUSD debt
// and no interest, so there is no "Interest since last event" and, with no
// price at the previous event, no "Last event" or "Market move": the breakdown
// holds "Before this event" alone. The receipt read starts when the card opens
// (`active`); the sheet is null until the price it needs has landed.

import type { LiquityV1Context } from "@/lib/shared/types/event-shape";
import {
  SHEET_WORDS,
  sheetUsd,
  type EventSheet,
  type SheetRow,
  type SheetSide,
  type SheetStat,
} from "@/components/shared/event-sheet";
import { changeText } from "@/components/shared/change-swap-value";
import { faceUsdProv } from "@/lib/shared/flows-timeline-provenance";
import { COLL_VERB, DEBT_VERB } from "@/lib/shared/liquity-fork-ops";
import {
  collAfterProv,
  collBeforeProv,
  collDeltaProv,
  collUsdAtBlockProv,
  borrowingFeeProv,
  closeRepaidProv,
  debtAfterProv,
  debtBeforeProv,
  debtDeltaProv,
  drawReceivedProv,
  liqSeizedUsdProv,
  ratioAtBlockProv,
  redemptionDebtSplitProv,
  redemptionLegProv,
  reserveProv,
  sheetRatioChangeProv,
  sheetLiqPriceChangeProv,
  sheetToMinimumChangeProv,
  minimumRatioProv,
  recoveryRatioProv,
  sheetFaceUsdProv,
  sheetLiqPriceProv,
  sheetMoveUsdProv,
  sheetToMinimumProv,
  type LiquityV1Coords,
} from "@/lib/liquity-v1/event-provenance";
import {
  COLLATERAL_SYMBOL,
  DEBT_SYMBOL,
  LIQUITY_V1_ADDRESSES,
  LIQUITY_V1_CCR,
  LIQUITY_V1_MCR,
} from "@/lib/liquity-v1/asset-catalog";
import {
  LIQUIDATION_COLL_VERB,
  LIQUIDATION_DEBT_VERB,
  LIQUITY_V1_MIN_DEBT,
  LIQUITY_V1_RESERVE,
  fmtEth,
  fmtLusd,
  fmtPct,
  ratioOf,
  redemptionSplit,
  sidesOf,
} from "@/lib/liquity-v1/event-figures";
import { useLiquityV1EventReadState } from "@/lib/liquity-v1/use-event-read";
import { V1_WORDS } from "@/lib/liquity-v1/event-templates";
import { liquityV1EventPrice } from "./liquity-v1-event-detail";

const DUST_COLL = 0.00005;
const DUST_DEBT = 0.005;
const EPS = 1e-9;

const signed = (n: number, text: string) => (n < 0 ? `−${text}` : text);
const usd2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pts = (a: number) =>
  `${a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${V1_WORDS.sheet_pts}`;

export interface LiquityV1SheetArgs {
  ctx: LiquityV1Context;
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
  /** The card is open: the receipt read starts. */
  active: boolean;
}

/** The card's sheet: null while the price it values the collateral at is on
 *  its way, a sheet once it stands. */
export function useLiquityV1Sheet({ ctx, txHash, blockNumber, wallet, active }: LiquityV1SheetArgs): EventSheet | null {
  const { read, pending } = useLiquityV1EventReadState(active ? txHash : undefined, wallet);
  const price = liquityV1EventPrice(ctx, read);
  if (!active || (price == null && pending)) return null;

  const coords: LiquityV1Coords = { txHash, blockNumber, wallet };
  const s = sidesOf(ctx);
  const isOpen = ctx.eventType === "openTrove";
  const isClose = ctx.eventType === "closeTrove";
  const isLiq = ctx.eventType === "liquidation";
  const isRedemption = ctx.eventType === "redemption";
  const isAdjust = ctx.eventType === "adjustTrove";
  const ends = isClose || isLiq || (isRedemption && s.debtAfter <= EPS);
  const split = redemptionSplit(ctx);
  const LUSD = LIQUITY_V1_ADDRESSES.LUSD;

  // ── Collateral: the event's rows, the balance before, the balance after ──
  const collRows: SheetRow[] = [];
  const collMove = (
    key: string,
    label: string,
    amount: number,
    tip: string,
    info = collDeltaProv(coords, {
      after: ctx.collAfter,
      before: ctx.collBefore,
    }),
    usdInfo = price != null
      ? sheetMoveUsdProv(coords, { amount: `${fmtEth(Math.abs(amount))} ${COLLATERAL_SYMBOL}`, priceUsd: price })
      : undefined,
  ) => {
    if (Math.abs(amount) < DUST_COLL) return;
    collRows.push({
      key,
      label,
      amount: { text: signed(amount, fmtEth(Math.abs(amount))), symbol: COLLATERAL_SYMBOL, info },
      usd: price != null && usdInfo ? { text: sheetUsd(amount * price), info: usdInfo } : undefined,
      tip,
    });
  };
  if (isRedemption && split?.full) {
    const legVals = { debt: String(split.lusdRedeemed), priceUsd: split.price, coll: ctx.collBefore };
    collMove(
      "reduced",
      V1_WORDS.sheet_reduced,
      -split.ethToRedeemer,
      V1_WORDS.tip_coll_reduced,
      redemptionLegProv(coords, "redeemer", legVals),
    );
    collMove(
      "surplus",
      V1_WORDS.sheet_surplus,
      -split.ethSurplus,
      V1_WORDS.tip_coll_surplus,
      redemptionLegProv(coords, "surplus", legVals),
    );
  } else if (isRedemption) {
    collMove("event", V1_WORDS.sheet_reduced, s.collDelta, V1_WORDS.tip_coll_reduced);
  } else if (isLiq) {
    collMove(
      "event",
      LIQUIDATION_COLL_VERB,
      s.collDelta,
      V1_WORDS.tip_coll_seized,
      undefined,
      price != null
        ? liqSeizedUsdProv(coords, { amount: `${ctx.collBefore} ${COLLATERAL_SYMBOL}`, priceUsd: price })
        : undefined,
    );
  } else {
    collMove("event", s.collDelta >= 0 ? COLL_VERB.add : COLL_VERB.withdraw, s.collDelta, V1_WORDS.tip_coll_event);
  }

  const collBeforeUsd = price != null ? s.collBefore * price : null;
  const collAfterUsd = price != null ? s.collAfter * price : null;
  const collSide: SheetSide = {
    side: "collateral",
    icons: [COLLATERAL_SYMBOL],
    carry: [],
    before:
      !isOpen && collRows.length > 0
        ? {
            key: "before",
            label: SHEET_WORDS.before,
            amount: { text: fmtEth(s.collBefore), symbol: COLLATERAL_SYMBOL, info: collBeforeProv(coords) },
            usd:
              price != null && collBeforeUsd != null
                ? {
                    text: sheetUsd(collBeforeUsd),
                    info: collUsdAtBlockProv(coords, { coll: ctx.collBefore, priceUsd: price, side: "before" }),
                  }
                : undefined,
            tip: V1_WORDS.tip_coll_before,
          }
        : undefined,
    rows: collRows,
    total:
      s.collAfter <= EPS
        ? { text: "$0", info: collAfterProv(coords) }
        : price != null && collAfterUsd != null
          ? {
              text: sheetUsd(collAfterUsd),
              info: collUsdAtBlockProv(coords, { coll: ctx.collAfter, priceUsd: price, side: "after" }),
            }
          : { none: V1_WORDS.sheet_no_price },
    totalAmount: {
      text: fmtEth(s.collAfter <= EPS ? 0 : s.collAfter),
      symbol: COLLATERAL_SYMBOL,
      info: collAfterProv(coords),
    },
    totalTip: V1_WORDS.tip_coll_total,
  };

  // ── Debt: the event's rows, the debt before, the debt after, at $1 face ──
  const debtRows: SheetRow[] = [];
  const debtMove = (
    key: string,
    label: string,
    amount: number,
    tip: string,
    info = debtDeltaProv(coords, { after: ctx.debtAfter, before: ctx.debtBefore }),
  ) => {
    if (Math.abs(amount) < DUST_DEBT) return;
    debtRows.push({
      key,
      label,
      amount: { text: signed(amount, fmtLusd(Math.abs(amount))), symbol: DEBT_SYMBOL, address: LUSD, info },
      usd: { text: sheetUsd(amount), info: sheetFaceUsdProv(label, fmtLusd(Math.abs(amount))) },
      tip,
    });
  };
  const fee = Number(ctx.borrowingFee ?? read?.borrowingFee);
  const received = Number(ctx.lusdReceived ?? read?.lusdMintedToOwner);
  const reserveIn = isOpen ? LIQUITY_V1_RESERVE : 0;
  const drawSplits =
    s.debtDelta > EPS &&
    Number.isFinite(fee) &&
    Number.isFinite(received) &&
    Math.abs(received + fee + reserveIn - s.debtDelta) < 0.01;
  if (isClose) {
    debtMove(
      "event",
      DEBT_VERB.repay,
      -Math.max(0, Math.abs(s.debtDelta) - LIQUITY_V1_RESERVE),
      V1_WORDS.tip_debt_repaid,
      closeRepaidProv(coords, ctx.debtBefore),
    );
    debtMove(
      "reserve",
      V1_WORDS.sheet_reserve,
      -LIQUITY_V1_RESERVE,
      V1_WORDS.tip_debt_reserve,
      reserveProv(coords, "burned"),
    );
  } else if (isLiq) {
    debtMove("event", LIQUIDATION_DEBT_VERB, s.debtDelta, V1_WORDS.tip_debt_cleared);
  } else if (isRedemption && split?.full) {
    const splitProv = redemptionDebtSplitProv(ctx.debtBefore);
    debtMove("event", LIQUIDATION_DEBT_VERB, -split.lusdRedeemed, V1_WORDS.tip_debt_cleared, splitProv);
    debtMove("reserve", V1_WORDS.sheet_reserve, -split.reserveBurned, V1_WORDS.tip_debt_reserve, splitProv);
  } else if (isRedemption) {
    debtMove("event", LIQUIDATION_DEBT_VERB, s.debtDelta, V1_WORDS.tip_debt_cleared);
  } else if (drawSplits) {
    debtMove(
      "event",
      DEBT_VERB.borrow,
      received,
      V1_WORDS.tip_debt_received,
      drawReceivedProv(coords, { debtAdded: ctx.debtDelta, fee: String(fee), open: isOpen }),
    );
    debtMove("fee", V1_WORDS.sheet_borrowing_fee, fee, V1_WORDS.tip_debt_fee, borrowingFeeProv(coords, String(fee)));
    if (isOpen)
      debtMove(
        "reserve",
        V1_WORDS.sheet_reserve,
        LIQUITY_V1_RESERVE,
        V1_WORDS.tip_debt_reserve,
        reserveProv(coords, "minted"),
      );
  } else if (isOpen || isAdjust) {
    debtMove("event", s.debtDelta >= 0 ? DEBT_VERB.borrow : DEBT_VERB.repay, s.debtDelta, V1_WORDS.tip_debt_event);
  }

  const debtSide: SheetSide = {
    side: "debt",
    icons: [DEBT_SYMBOL],
    carry: [],
    before:
      !isOpen && debtRows.length > 0
        ? {
            key: "before",
            label: SHEET_WORDS.before,
            amount: { text: fmtLusd(s.debtBefore), symbol: DEBT_SYMBOL, address: LUSD, info: debtBeforeProv(coords) },
            usd: { text: sheetUsd(s.debtBefore), info: faceUsdProv(DEBT_SYMBOL, fmtLusd(s.debtBefore), "before") },
            tip: V1_WORDS.tip_debt_before,
          }
        : undefined,
    rows: debtRows,
    total: {
      text: s.debtAfter > EPS ? sheetUsd(s.debtAfter) : "$0",
      info: s.debtAfter > EPS ? faceUsdProv(DEBT_SYMBOL, fmtLusd(s.debtAfter), "after") : debtAfterProv(coords),
    },
    totalAmount: {
      text: fmtLusd(s.debtAfter > EPS ? s.debtAfter : 0),
      symbol: DEBT_SYMBOL,
      address: LUSD,
      info: debtAfterProv(coords),
    },
    totalTip: V1_WORDS.tip_debt_total,
  };

  // ── Risk: the ratio and the price that liquidates the Trove ──
  const crBefore = isOpen ? null : ratioOf(s.collBefore, s.debtBefore, price);
  const crAfter = ends ? null : ratioOf(s.collAfter, s.debtAfter, price);
  const ratioProv = (side: "before" | "after") =>
    price != null
      ? ratioAtBlockProv(coords, {
          coll: side === "before" ? ctx.collBefore : ctx.collAfter,
          debt: side === "before" ? ctx.debtBefore : ctx.debtAfter,
          priceUsd: price,
          side,
        })
      : undefined;
  const liqOf = (coll: number, debt: number) => (coll > EPS && debt > EPS ? (debt * LIQUITY_V1_MCR) / coll : null);
  const liqAfter = ends ? null : liqOf(s.collAfter, s.debtAfter);
  const liqBefore = isOpen ? null : liqOf(s.collBefore, s.debtBefore);
  const mcrText = `${(LIQUITY_V1_MCR * 100).toFixed(0)}%`;
  const risk: SheetStat[] = [
    {
      key: "ratio",
      label: V1_WORDS.sheet_collateral_ratio,
      tip: V1_WORDS.tip_cr,
      value: ends
        ? { none: V1_WORDS.sheet_closed }
        : crAfter != null
          ? { text: fmtPct(crAfter), info: ratioProv("after") }
          : { none: price == null ? V1_WORDS.sheet_no_price : V1_WORDS.sheet_closed },
      change:
        crAfter != null && crBefore != null
          ? {
              text: changeText((crAfter - crBefore) * 100, pts),
              info: sheetRatioChangeProv(),
            }
          : null,
    },
    {
      key: "liquidates-at",
      label: V1_WORDS.sheet_liquidates_at,
      tip: V1_WORDS.tip_liquidates_at,
      value:
        liqAfter != null
          ? {
              text: usd2(liqAfter),
              info: sheetLiqPriceProv(coords, {
                debt: fmtLusd(s.debtAfter),
                coll: fmtEth(s.collAfter),
                mcr: mcrText,
              }),
            }
          : { none: V1_WORDS.sheet_closed },
      change:
        liqAfter != null && liqBefore != null
          ? {
              text: changeText(liqAfter - liqBefore, usd2),
              info: sheetLiqPriceChangeProv(),
            }
          : null,
    },
  ];

  // ── Limits: the room above the minimum debt. "Debt in front" is on the
  // position card only (decision 0042 point 6). ──
  const toMin = (debt: number) => Math.max(0, debt - LIQUITY_V1_MIN_DEBT);
  const toMinAfter = toMin(s.debtAfter);
  const limits: SheetStat[] = [
    {
      key: "to-minimum",
      label: V1_WORDS.sheet_to_minimum,
      tip: V1_WORDS.tip_to_minimum,
      value: ends
        ? { none: V1_WORDS.sheet_closed }
        : {
            text: `${fmtLusd(toMinAfter)} ${DEBT_SYMBOL}`,
            info: sheetToMinimumProv(fmtLusd(s.debtAfter), String(LIQUITY_V1_MIN_DEBT)),
          },
      change:
        !ends && !isOpen
          ? {
              text: changeText(toMinAfter - toMin(s.debtBefore), (a) => `${fmtLusd(a)} ${DEBT_SYMBOL}`),
              info: sheetToMinimumChangeProv(),
            }
          : null,
    },
  ];
  const params: SheetStat[] = [
    {
      key: "minimum-ratio",
      label: V1_WORDS.sheet_minimum_ratio,
      tip: V1_WORDS.tip_minimum_ratio,
      value: { text: mcrText, info: minimumRatioProv() },
    },
    {
      key: "recovery-ratio",
      label: V1_WORDS.sheet_recovery_ratio,
      tip: V1_WORDS.tip_recovery_ratio,
      value: {
        text: `${(LIQUITY_V1_CCR * 100).toFixed(0)}%`,
        info: recoveryRatioProv(),
      },
    },
  ];

  return {
    sides: [collSide, debtSide],
    panels: [
      { panel: "risk", rows: risk },
      { panel: "limits", rows: limits, breakdown: params },
    ],
  };
}
