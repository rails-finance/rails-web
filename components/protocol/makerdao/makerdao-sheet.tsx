"use client";

// MakerDAO's T2 as a balance sheet (ui-jobs 330): the card's `sheet` slot.
// Collateral and Debt over the Vat state after the event, a Risk and a Limits
// panel beneath. The figures are the ones makerdao-cells.tsx states: urn.ink,
// the debt urn.art × the ilk's rate at the block, the stability fee since the
// previous event, the OSM price and the minimum ratio the page's ilk read
// holds for the block. A row ends in the "?" whose words are the strings file's
// `tip_*` entries. Only a frob, a grab and a fork state a balance, so a give
// and the auction markers keep the cells (undefined here).

import { usePathname } from "next/navigation";
import { useContext } from "react";
import { EventPageContext } from "@/components/shared/event-page-aside";
import { useEventShareHref } from "@/components/shared/event-share-context";
import { useMakerIlkAt } from "@/lib/makerdao/use-chain-history";
import { fillText, MAKER_WORDS } from "@/lib/makerdao/event-templates";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import { collAmount, debtDigits } from "@/lib/makerdao/price-format";
import {
  atBlock,
  debtAfterProv,
  debtBeforeProv,
  debtChangeProv,
  dinkProv,
  eventInputs,
  eventRatioProv,
  inkAfterProv,
  inkBeforeProv,
  interestSincePreviousProv,
  liquidationPriceProv,
  matAtBlockProv,
  roomAtBlockProv,
  type MakerCoords,
} from "@/lib/makerdao/event-provenance";
import { useMakerVaultHistory } from "@/lib/makerdao/vault-history";
import {
  makerCollateralUsd,
  makerDebtUsd,
  makerLiquidationPrice,
  type MakerPriceCap,
} from "@/lib/makerdao/usd-receipt";
import { priceText } from "@/lib/shared/shown-usd";
import type { MakerDAOContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import { changeText } from "@/components/shared/change-swap-value";
import {
  SHEET_WORDS,
  sheetUsd,
  type EventSheet,
  type SheetRow,
  type SheetSide,
  type SheetStat,
} from "@/components/shared/event-sheet";
import { formatExactDecimal } from "@/lib/utils/format";
import { fmtDai, fmtMat, fmtRatio } from "./makerdao-cells";
import { faceParts } from "@/lib/shared/sheet-usd-rows";

const UNREAD = "Not read on this page";
const DUST_COLL = 0.00005;
const DUST_DEBT = 0.005;

const signed = (n: number, text: string) => (n < 0 ? `−${text}` : text);

/** A collateral amount's dollars at the OSM price of the event's block: the
 *  amount × the price as shown, the product to the cent (ui-jobs 743). */
function collUsd(
  sym: string,
  what: string,
  amount: number,
  price: number,
  coords: MakerCoords,
  cap: MakerPriceCap | null = null,
) {
  return makerCollateralUsd({
    cap,
    what: `${what} in US dollars`,
    symbol: sym,
    ink: amount,
    inkSource: "api",
    inkBlock: coords.blockNumber ?? null,
    price,
    priceBlock: coords.blockNumber ?? null,
  });
}

/** DAI (or USDS) at the Vat's $1 par. */
const faceUsd = (sym: string, what: string, amount: number) =>
  makerDebtUsd({
    what: `${what} in US dollars`,
    symbol: sym,
    debt: amount,
    amountNote: "the vault's normalized debt × the ilk's rate accumulator at this event's block",
  });

/** A sheet cell from a receipt: its figure, signed where the amount is. */
const usdCell = (r: { prov: Provenance; usd: number } | null, sign = 1) =>
  r ? { text: sheetUsd(sign < 0 ? -r.usd : r.usd), info: r.prov, cents: sign < 0 ? -r.usd : r.usd } : undefined;

/** A figure's change over this event: the figure after less the figure before. */
function changeProv(what: string, formula: string): Provenance {
  return {
    kind: "derived",
    summary: `${what}. The figure after this event less the figure just before it, at the OSM price of this block.`,
    formula,
  };
}

/** The sheet; undefined where the cells stand: the event moves no balance, its
 *  running figures did not load, or the ilk read at its block is not on hand.
 *  The page reads the ilk for each row of a short history. A row of a longer
 *  one reads that block while its card is open (`open`, the card's opened
 *  read; the event page's card is always open), null while that read is on
 *  its way. A closed row makes no read. */
export function useMakerSheet(ctx: MakerDAOContext, coords: MakerCoords, open = false): EventSheet | null | undefined {
  const history = useMakerVaultHistory();
  const pathname = usePathname();
  const ownPage = useEventShareHref()?.split("?")[0];
  const pinned = useContext(EventPageContext) != null || (ownPage != null && pathname === ownPage);
  const reads = pinned || open;
  const block = coords.blockNumber;
  const heldPage = block != null ? history.ilkAt.get(block) : undefined;
  const own = useMakerIlkAt(heldPage || block == null || !reads ? null : ctx.ilk, block != null ? [block] : []);
  const held = heldPage ?? (block != null ? own?.reads.get(block) : undefined);
  const isGrab = ctx.eventType === "grab";
  const stated = isGrab || ctx.eventType === "frob" || ctx.eventType === "fork-in" || ctx.eventType === "fork-out";
  if (!stated || ctx.inkAfter == null || ctx.debtAfter == null) return undefined;
  const price = isGrab ? (ctx.priceAtBlock?.usd ?? held?.priceUsd ?? null) : (held?.priceUsd ?? null);
  if (!held && !(isGrab && price != null)) return reads && block != null && own == null ? null : undefined;
  const mat = held?.mat ?? null;
  const dust = held?.dustDai ?? null;

  const collSym = ctx.collateralSymbol;
  const debtSym = ilkDebtSymbol(ctx.ilk);
  const inkAfter = Number(ctx.inkAfter);
  const dink = Number(ctx.dink) || 0;
  const inkBefore = inkAfter - dink;
  const debtAfter = Number(ctx.debtAfter);
  const debtMove = Number(ctx.debtChange) || 0;
  const debtBefore = debtAfter - debtMove;
  const interest = Number(ctx.interestSincePrevious) || 0;
  const hasPrev = !ctx.isOpen;

  const TIP = {
    collLast: fillText(MAKER_WORDS.tip_coll_last, { coll_symbol: collSym }),
    collBefore: fillText(MAKER_WORDS.tip_coll_before, { coll_symbol: collSym }),
    collEvent: fillText(MAKER_WORDS.tip_coll_event, { coll_symbol: collSym }),
    collTotal: fillText(MAKER_WORDS.tip_coll_total, { coll_symbol: collSym }),
    debtLast: fillText(MAKER_WORDS.tip_debt_last, { debt_symbol: debtSym }),
    debtInterest: fillText(MAKER_WORDS.tip_debt_interest, { debt_symbol: debtSym }),
    debtInterestAsset: fillText(MAKER_WORDS.tip_debt_interest_asset, { debt_symbol: debtSym }),
    debtBefore: MAKER_WORDS.tip_debt_before,
    debtEvent: MAKER_WORDS.tip_debt_event,
    debtTotal: fillText(MAKER_WORDS.tip_debt_total, { debt_symbol: debtSym }),
    ratio: fillText(MAKER_WORDS.tip_ratio, { coll_symbol: collSym }),
    liquidatesAt: fillText(MAKER_WORDS.tip_liquidates_at, { coll_symbol: collSym }),
    drawable: fillText(MAKER_WORDS.tip_drawable, { debt_symbol: debtSym }),
    stabilityFee: MAKER_WORDS.tip_stability_fee,
    minimumRatio: fillText(MAKER_WORDS.tip_minimum_ratio, { ilk: ctx.ilk }),
    debtCeiling: fillText(MAKER_WORDS.tip_debt_ceiling, { debt_symbol: debtSym }),
    minimumDebt: fillText(MAKER_WORDS.tip_minimum_debt, { debt_symbol: debtSym }),
  };

  // The event's word on each side.
  const collWord = isGrab
    ? "Seized in liquidation"
    : ctx.eventType === "fork-out"
      ? "Moved to another vault"
      : ctx.eventType === "fork-in"
        ? "Moved from another vault"
        : dink > 0
          ? "Deposit"
          : "Withdraw";
  const debtWord = isGrab
    ? "Cleared in liquidation"
    : ctx.eventType === "fork-out"
      ? "Moved to another vault"
      : ctx.eventType === "fork-in"
        ? "Moved from another vault"
        : debtMove > 0
          ? "Draw"
          : "Repay";

  // LockStake's capped feed at the block, named on each receipt where it binds.
  const collUsdAt = (what: string, amount: number, p: number, c: MakerCoords) =>
    collUsd(collSym, what, amount, p, c, held?.priceCap ?? null);

  // ── Collateral ──
  const collAfterUsd = price != null ? collUsdAt("Collateral after this event", inkAfter, price, coords) : null;
  const collBeforeUsd = price != null ? collUsdAt("Collateral just before this event", inkBefore, price, coords) : null;
  const debtAfterUsd = faceUsd(debtSym, "Debt after this event", debtAfter);
  const collRows: SheetRow[] = [];
  if (Math.abs(dink) >= DUST_COLL)
    collRows.push({
      key: "event",
      label: collWord,
      amount: {
        text: signed(dink, collAmount(Math.abs(dink))),
        symbol: collSym,
        info: dinkProv(collSym, coords),
        value: formatExactDecimal(String(Math.abs(dink))),
      },
      usd: price != null ? usdCell(collUsdAt("Collateral this event moved", dink, price, coords), dink) : undefined,
      tip: TIP.collEvent,
    });
  const collCarry: SheetSide["carry"] = [];
  if (hasPrev && inkBefore > DUST_COLL)
    collCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: { text: collAmount(inkBefore), symbol: collSym, info: inkBeforeProv(collSym, coords) },
      tip: TIP.collLast,
    });
  const collSide: SheetSide = {
    side: "collateral",
    icons: [collSym],
    carry: collCarry,
    before:
      collCarry.length > 0
        ? {
            key: "before",
            label: SHEET_WORDS.before,
            amount: { text: collAmount(inkBefore), symbol: collSym, info: inkBeforeProv(collSym, coords) },
            usd:
              price != null
                ? usdCell(collUsdAt("Collateral just before this event", inkBefore, price, coords))
                : undefined,
            tip: TIP.collBefore,
          }
        : undefined,
    rows: collRows,
    total:
      price != null && collAfterUsd
        ? { text: inkAfter > 0 ? sheetUsd(collAfterUsd.usd) : "$0", cents: collAfterUsd.usd, info: collAfterUsd.prov }
        : { none: "No price read at this block" },
    totalAmount: { text: collAmount(inkAfter), symbol: collSym, info: inkAfterProv(collSym, coords) },
    totalTip: TIP.collTotal,
  };

  // ── Debt ──
  const debtRows: SheetRow[] = [];
  const debtFig = (n: number) => signed(n, n < 0 ? debtDigits(-n) : fmtDai(n));
  if (Math.abs(debtMove) >= DUST_DEBT)
    debtRows.push({
      key: "event",
      label: debtWord,
      amount: { text: debtFig(debtMove), symbol: debtSym, info: debtChangeProv(debtSym, coords) },
      usd: usdCell(faceUsd(debtSym, "Debt this event moved", debtMove), debtMove),
      tip: TIP.debtEvent,
    });
  const debtCarry: SheetSide["carry"] = [];
  const debtLast = debtBefore - interest;
  if (hasPrev && debtLast > DUST_DEBT) {
    debtCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: { text: fmtDai(debtLast), symbol: debtSym, info: debtBeforeProv(debtSym, coords) },
      usd: usdCell(faceUsd(debtSym, "Debt after the previous event", debtLast)),
      tip: TIP.debtLast,
    });
    if (interest >= DUST_DEBT)
      debtCarry.push({
        key: "interest",
        label: SHEET_WORDS.interest,
        usd: { ...faceParts(interest), info: interestSincePreviousProv(debtSym, coords) },
        tip: TIP.debtInterest,
        sub: [
          {
            key: `interest-${debtSym}`,
            label: debtSym,
            note: "$1.00 face",
            amount: { text: fmtDai(interest), symbol: debtSym, info: interestSincePreviousProv(debtSym, coords) },
            usd: { ...faceParts(interest), info: interestSincePreviousProv(debtSym, coords) },
            tip: TIP.debtInterestAsset,
          },
        ],
      });
  }
  const debtSide: SheetSide = {
    side: "debt",
    icons: [debtSym],
    carry: debtCarry,
    before:
      debtCarry.length > 0
        ? {
            key: "before",
            label: SHEET_WORDS.before,
            amount: { text: fmtDai(debtBefore), symbol: debtSym, info: debtBeforeProv(debtSym, coords) },
            usd: usdCell(faceUsd(debtSym, "Debt just before this event", debtBefore)),
            tip: TIP.debtBefore,
          }
        : undefined,
    rows: debtRows,
    total: {
      text: debtAfter > 0 ? sheetUsd(debtAfterUsd.usd) : "$0",
      cents: debtAfterUsd.usd,
      info: debtAfterUsd.prov,
    },
    totalAmount: { text: fmtDai(debtAfter), symbol: debtSym, info: debtAfterProv(debtSym, coords) },
    totalTip: TIP.debtTotal,
  };

  // ── Risk and Limits ──
  const owes = debtAfter > 1e-9;
  const owedBefore = debtBefore > 1e-9;
  // The collateral's dollars as the Collateral cells draw them (ui-jobs 743).
  const ratioAfter = collAfterUsd != null && owes ? collAfterUsd.usd / debtAfter : null;
  const ratioBefore = collBeforeUsd != null && owedBefore ? collBeforeUsd.usd / debtBefore : null;
  const collUsdAfter = collAfterUsd?.usd ?? 0;
  const collUsdBefore = collBeforeUsd?.usd ?? 0;
  const ratioInputs = (side: "before" | "after") =>
    side === "after"
      ? { collateralUsd: sheetUsd(collUsdAfter), debt: `${fmtDai(debtAfter)} ${debtSym}` }
      : { collateralUsd: sheetUsd(collUsdBefore), debt: `${fmtDai(debtBefore)} ${debtSym}` };
  const pts = (a: number) => `${(a * 100).toFixed(2)} pts`;
  // From the inputs as the receipt shows them (ui-jobs 743).
  const liqOf = (ink: number, debt: number) =>
    mat != null && ink > 1e-9 && debt > 1e-9 ? makerLiquidationPrice(debt, mat, ink) : null;
  const liqAfterShown = liqOf(inkAfter, debtAfter);
  const liqAfter = liqAfterShown?.price ?? null;
  const liqBefore = liqOf(inkBefore, debtBefore)?.price ?? null;
  const usd2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const noDebt = isGrab && !owes ? "Liquidated" : "No debt";

  const risk: SheetStat[] = [
    {
      key: "ratio",
      label: "Collateral ratio",
      tip: TIP.ratio,
      value:
        ratioAfter != null
          ? { text: fmtRatio(ratioAfter), info: eventRatioProv("after", coords, ratioInputs("after")) }
          : { none: price == null ? "No price read at this block" : noDebt },
      change:
        ratioAfter != null && ratioBefore != null
          ? {
              text: changeText(ratioAfter - ratioBefore, pts),
              info: changeProv("Collateral ratio change over this event, in percentage points", "after − before"),
            }
          : null,
    },
    {
      key: "liquidates-at",
      label: "Liquidates at",
      tip: TIP.liquidatesAt,
      value:
        liqAfter != null
          ? {
              text: usd2(liqAfter),
              info: liquidationPriceProv(
                `${liqAfterShown!.debt} ${debtSym}`,
                liqAfterShown!.mat,
                `${liqAfterShown!.ink} ${collSym}`,
                priceText(liqAfter),
              ),
            }
          : { none: mat == null && owes ? "Minimum ratio not read at this block" : noDebt },
      change:
        liqAfter != null && liqBefore != null
          ? {
              text: changeText(liqAfter - liqBefore, usd2),
              info: changeProv("Liquidation price change over this event", "after − before"),
            }
          : null,
    },
  ];

  const roomOf = (ink: number, debt: number) =>
    mat != null && price != null ? Math.max(0, (collUsdAt("", ink, price, coords)?.usd ?? 0) / mat - debt) : null;
  const roomAfter = owes || debtMove !== 0 ? roomOf(inkAfter, debtAfter) : null;
  const roomBefore = roomOf(inkBefore, debtBefore);
  const limits: SheetStat[] = [
    {
      key: "drawable",
      label: "Still drawable",
      tip: TIP.drawable,
      value:
        roomAfter != null
          ? { text: `${fmtDai(roomAfter)} ${debtSym}`, info: roomAtBlockProv(coords), value: fmtDai(roomAfter) }
          : {
              none:
                mat == null
                  ? "Minimum ratio not read at this block"
                  : price == null
                    ? "No price read at this block"
                    : noDebt,
            },
      change:
        roomAfter != null && roomBefore != null
          ? {
              text: changeText(roomAfter - roomBefore, (a) => `${fmtDai(a)} ${debtSym}`),
              info: changeProv(`${debtSym} still drawable, change over this event`, "after − before"),
            }
          : null,
    },
    // The ilk's yearly stability fee: the event's data carries the fee as the
    // DAI accrued since the previous event.
    { key: "stability-fee", label: "Stability fee", tip: TIP.stabilityFee, value: { none: UNREAD } },
  ];

  const params: SheetStat[] = [
    {
      key: "minimum-ratio",
      label: "Minimum ratio",
      tip: TIP.minimumRatio,
      value:
        mat != null
          ? { text: fmtMat(mat), info: matAtBlockProv(ctx.ilk, coords), value: fmtMat(mat) }
          : { none: "Not read at this block" },
    },
    { key: "debt-ceiling", label: "Debt ceiling", tip: TIP.debtCeiling, value: { none: UNREAD } },
    {
      key: "minimum-debt",
      label: "Minimum debt",
      tip: TIP.minimumDebt,
      value:
        dust != null
          ? {
              text: `${fmtDai(dust)} ${debtSym}`,
              info: {
                kind: "chain",
                pclass: "state",
                summary: `The least ${debtSym} a ${ctx.ilk} vault may owe while it owes anything. The Vat's dust for the ilk, read by eth_call${atBlock(coords)}.`,
                via: "Vat.ilks(ilk).dust at the event's block",
                inputs: eventInputs(coords),
              },
            }
          : { none: "Not read at this block" },
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
