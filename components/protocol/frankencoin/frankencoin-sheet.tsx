// Frankencoin's T2 as a balance sheet (rails-ops TO-DO-ui-jobs 330): the card's
// `sheet` slot for the events that moved the position's collateral or debt.
// One collateral token, ZCHF debt, and no dollar anywhere on the page: the rows
// state native units and each side's total is the balance after the event in
// the collateral's or ZCHF's unit. Risk is the owner-declared liquidation price (the headroom
// above it needs a market price the page does not hold) and a running
// challenge; Limits is the expiry and the interest rate; the breakdown holds
// the reserve requirement and the challenge phase length. The figures come
// from the ledger's two absolutes the cells already state (before→after) and
// the page's chain read (page-facts.tsx).

import type { FrankencoinContext } from "@/lib/shared/types/event-shape";
import {
  SHEET_WORDS,
  type EventSheet,
  type SheetRow,
  type SheetSide,
  type SheetStat,
} from "@/components/shared/event-sheet";
import { changeText } from "@/components/shared/change-swap-value";
import type { Provenance } from "@/components/shared/provenance";
import {
  beforeProv,
  changeProv,
  challengeReceiptProv,
  collateralAfterProv,
  liqPriceAfterProv,
  mintedAfterProv,
  type FrankencoinCoords,
} from "@/lib/frankencoin/event-provenance";
import { liveTermProv } from "@/lib/frankencoin/live-provenance";
import { FRANKENCOIN_ADDRESSES } from "@/lib/frankencoin/asset-catalog";
import { FRANKENCOIN_WORDS } from "@/lib/frankencoin/event-templates";
import { fmtFcColl, fmtFcPct, fmtFcPrice, fmtZchf, groupExact, phaseText } from "@/lib/frankencoin/figures";
import type { FrankencoinPageFacts } from "@/lib/frankencoin/page-facts";
import type { FrankencoinEventRead } from "@/lib/sources/chain/frankencoin-event";
import { formatDate } from "@/lib/date";

const UNREAD = "Not read on this page";
const CLOSED = "Closed";

const WORDS = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  mint: "Mint",
  repay: "Repay",
  sold: "Sold in the auction",
  soldForced: "Sold in the forced sale",
  cleared: "Cleared by the sale",
  liqPrice: "Liquidation price",
  headroom: "Price headroom",
  challenge: "Challenge running",
  expiry: "Expiry",
  interest: "Interest",
  reserve: "Reserve requirement",
  phase: "Challenge phase length",
};

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

export interface FrankencoinSheetArgs {
  ctx: FrankencoinContext;
  coords: FrankencoinCoords;
  eventId?: string;
  facts: FrankencoinPageFacts | null;
  /** The receipt read, where this event has one. */
  read: FrankencoinEventRead | null;
  /** A settlement row inside a forced sale's transaction. */
  forcedSettlement: boolean;
}

/** The sheet for one ledger event, or undefined for a kind whose balances did
 *  not move or whose figures the ledger cannot state (the cells stand). */
export function frankencoinSheet({
  ctx,
  coords,
  eventId,
  facts,
  read,
  forcedSettlement,
}: FrankencoinSheetArgs): EventSheet | undefined {
  const sym = ctx.collateralSymbol;
  const dec = ctx.collateralDecimals;
  if (ctx.collateral == null || ctx.minted == null || ctx.collateralUnderstated) return undefined;
  if (!ctx.firstState && (ctx.collateralBefore == null || ctx.mintedBefore == null)) return undefined;
  const collChanged = ctx.collateral !== ctx.collateralBefore;
  const debtChanged = ctx.minted !== ctx.mintedBefore;
  if (!collChanged && !debtChanged) return undefined;

  const collAfter = num(ctx.collateral);
  const collBefore = num(ctx.collateralBefore);
  const debtAfter = num(ctx.minted);
  const debtBefore = num(ctx.mintedBefore);
  const dColl = collAfter - collBefore;
  const dDebt = debtAfter - debtBefore;
  const settlement = ctx.eventType === "auction_settlement";
  const signed = (n: number, text: string) => (n < 0 ? `−${text}` : text);
  const collAddress = ctx.collateralToken;
  const zchfAddress = FRANKENCOIN_ADDRESSES.ZCHF;
  const readBefore = !!ctx.beforeReadAtBlock;

  // ── Collateral ──
  const collRows: SheetRow[] = collChanged
    ? [
        {
          key: "event",
          label: settlement
            ? forcedSettlement
              ? WORDS.soldForced
              : WORDS.sold
            : dColl > 0
              ? WORDS.deposit
              : WORDS.withdraw,
          amount: {
            text: signed(dColl, fmtFcColl(dColl)),
            symbol: sym,
            address: collAddress,
            info: changeProv("collateral", sym, coords),
            value: `${dColl >= 0 ? "+" : "−"}${fmtFcColl(dColl)}`,
          },
          tip: FRANKENCOIN_WORDS.tip_coll_event,
        },
      ]
    : [];
  const collBeforeRow: SheetRow | undefined =
    collBefore > 0
      ? {
          key: readBefore ? "before" : "last",
          label: readBefore ? SHEET_WORDS.before : SHEET_WORDS.last,
          amount: {
            text: fmtFcColl(collBefore),
            symbol: sym,
            address: collAddress,
            info: beforeProv("collateral", sym, coords, ctx.raw?.collateralBefore, readBefore),
          },
          tip: readBefore ? FRANKENCOIN_WORDS.tip_coll_before : FRANKENCOIN_WORDS.tip_coll_last,
        }
      : undefined;
  const collSide: SheetSide = {
    side: "collateral",
    icons: [sym],
    carry: collBeforeRow && !readBefore ? [collBeforeRow] : [],
    before: collBeforeRow && readBefore ? collBeforeRow : undefined,
    rows: collRows,
    total: {
      text: `${fmtFcColl(collAfter)} ${sym}`,
      info: collateralAfterProv(sym, coords, ctx.raw?.collateral),
    },
    totalTip: FRANKENCOIN_WORDS.tip_coll_total,
  };

  // ── Debt ──
  const debtRows: SheetRow[] = debtChanged
    ? [
        {
          key: "event",
          label: settlement ? WORDS.cleared : dDebt > 0 ? WORDS.mint : WORDS.repay,
          amount: {
            text: signed(dDebt, fmtZchf(dDebt)),
            symbol: "ZCHF",
            address: zchfAddress,
            info: changeProv("minted", sym, coords),
            value: `${dDebt >= 0 ? "+" : "−"}${fmtZchf(dDebt)}`,
          },
          tip: FRANKENCOIN_WORDS.tip_debt_event,
        },
      ]
    : [];
  const debtSide: SheetSide = {
    side: "debt",
    icons: ["ZCHF"],
    // Interest is charged up front at each mint, so nothing accrues between
    // events: the debt before this event is the debt the previous one left.
    carry:
      debtBefore > 0
        ? [
            {
              key: "last",
              label: SHEET_WORDS.last,
              amount: {
                text: fmtZchf(debtBefore),
                symbol: "ZCHF",
                address: zchfAddress,
                info: beforeProv("minted", sym, coords, ctx.raw?.mintedBefore),
              },
              tip: FRANKENCOIN_WORDS.tip_debt_last,
            },
          ]
        : [],
    rows: debtRows,
    total: {
      text: `${fmtZchf(debtAfter)} ZCHF`,
      info: mintedAfterProv(coords, ctx.raw?.minted),
    },
    totalTip: FRANKENCOIN_WORDS.tip_debt_total,
  };

  // ── Risk ──
  const closed = collAfter === 0 && debtAfter === 0;
  const liq = ctx.liqPrice != null ? num(ctx.liqPrice) : null;
  const liqBefore = ctx.liqPriceBefore != null ? num(ctx.liqPriceBefore) : null;
  const zchfPrice = (n: number) => `${fmtFcPrice(n)} ZCHF`;
  const risk: SheetStat[] = [
    {
      key: "liq-price",
      label: WORDS.liqPrice,
      tip: FRANKENCOIN_WORDS.tip_liq_price,
      value: closed
        ? { none: CLOSED }
        : liq != null
          ? {
              text: zchfPrice(liq),
              info: liqPriceAfterProv(sym, dec, coords, ctx.raw?.price),
              value: fmtFcPrice(liq),
            }
          : { none: UNREAD },
      change:
        !closed && liq != null && liqBefore != null && liqBefore > 0
          ? { text: changeText(liq - liqBefore, zchfPrice), info: changeProv("price", sym, coords) }
          : null,
    },
    {
      key: "price-headroom",
      label: WORDS.headroom,
      tip: FRANKENCOIN_WORDS.tip_headroom,
      value: { none: UNREAD },
    },
  ];
  const terms = facts?.terms ?? null;
  const challenged = terms?.challengedAmount ?? 0;
  // The chain read's challenge is the state now, which is the state after the
  // newest ledger event.
  if (!closed && challenged > 0 && eventId != null && facts?.latestLedgerEventId === eventId) {
    const period = facts?.challengePeriod ?? null;
    risk.push({
      key: "challenge",
      label: WORDS.challenge,
      tip: FRANKENCOIN_WORDS.tip_challenge,
      value: {
        text: `${fmtFcColl(challenged)} ${sym}${period != null && period > 0 ? ` · ${phaseText(period)} a phase` : ""}`,
        info: liveTermProv(
          "challengedAmount()",
          `${sym} in a challenge auction now: the position's challengedAmount() at the latest block, with the length of each of the challenge's two phases.`,
          ctx.position,
        ),
        value: String(challenged),
      },
    });
  }

  // ── Limits ──
  const rate = read?.rate ?? null;
  const ratePPM = rate?.annualInterestPPM ?? terms?.annualInterestPPM ?? null;
  const expiration = terms?.expiration ?? rate?.expiration ?? null;
  const rateInfo: Provenance | undefined =
    ratePPM == null
      ? undefined
      : rate
        ? challengeReceiptProv("rate", sym, coords, String(rate.annualInterestPPM / 10_000))
        : liveTermProv(
            "annualInterestPPM()",
            "The position's yearly interest rate at the latest block: annualInterestPPM(), parts per million ÷ 10,000 for a percent. Each mint pays the rate in force at its block.",
            ctx.position,
          );
  const limits: SheetStat[] = [
    {
      key: "expiry",
      label: WORDS.expiry,
      tip: FRANKENCOIN_WORDS.tip_expiry,
      value:
        expiration != null && expiration > 0
          ? {
              text: formatDate(expiration),
              info: liveTermProv(
                "expiration()",
                "When the position expires: its expiration() at the latest block, which is fixed for the life of the position. After it, anyone can buy the collateral in a forced sale.",
                ctx.position,
              ),
              value: String(expiration),
            }
          : { none: UNREAD },
    },
    {
      key: "interest",
      label: WORDS.interest,
      tip: FRANKENCOIN_WORDS.tip_interest,
      value:
        ratePPM != null
          ? { text: `${(ratePPM / 10_000).toFixed(2)}% a year`, info: rateInfo, value: String(ratePPM / 10_000) }
          : { none: UNREAD },
    },
  ];
  const reserve = terms?.reserveContributionPPM ?? null;
  const period = facts?.challengePeriod ?? null;
  const params: SheetStat[] = [
    {
      key: "reserve",
      label: WORDS.reserve,
      tip: FRANKENCOIN_WORDS.tip_reserve,
      value:
        reserve != null
          ? {
              text: fmtFcPct(reserve / 1_000_000),
              info: liveTermProv(
                "reserveContribution()",
                "The share of each mint held back in the system reserve: the position's reserveContribution() at the latest block, parts per million. Repaying returns it.",
                ctx.position,
              ),
              value: String(reserve),
            }
          : { none: UNREAD },
    },
    {
      key: "phase",
      label: WORDS.phase,
      tip: FRANKENCOIN_WORDS.tip_phase,
      value:
        period != null && period > 0
          ? {
              text: phaseText(period),
              info: liveTermProv(
                "challengePeriod()",
                "The length of each of a challenge's two phases: the position's challengePeriod() at the latest block, in seconds.",
                ctx.position,
              ),
              value: groupExact(String(period)),
            }
          : { none: UNREAD },
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
