"use client";

// LlamaLend's T2 as a balance sheet (rails-ops TO-DO-ui-jobs 330): the card's
// `sheet` slot, from the position read at block − 1 and at the event's block
// (lib/llamalend/use-event-state.ts), the figures llamalend-cells.tsx states.
//
// Collateral: the collateral token in the bands and the borrowed token the AMM
// holds from selling it, valued at the AMM's oracle price at this block. Debt:
// the borrowed token owed. A crvUSD market draws dollars (crvUSD at its $1
// face, as the position card does); any other market states its totals in its
// borrowed token and draws no dollar column. The carry layer holds the
// collateral the previous row stated and what the AMM sold since; the debt
// side has its read at the block before. Risk: health and the price at the top
// of the position's bands. Limits: what the AMM holds and the borrow rate; the
// bands, their prices and the discounts as parameters. A row the page does not
// read stands with its label and tip, "Not read on this page".

import type { ReactNode } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { changeText } from "@/components/shared/change-swap-value";
import {
  SHEET_WORDS,
  sheetUsd,
  type EventSheet,
  type SheetRow,
  type SheetSide,
  type SheetStat,
} from "@/components/shared/event-sheet";
import type { LlamalendContext } from "@/lib/shared/types/event-shape";
import type { LlamalendEventState } from "@/lib/llamalend/use-event-state";
import {
  fmtBandPrice,
  fmtColl,
  fmtHealth,
  fmtPrice,
  soldSincePrevious,
  type LlamalendEventFigures,
  type LlamalendPreviousStated,
} from "@/lib/llamalend/event-figures";
import {
  afterImageProv,
  collateralDeltaProv,
  debtDeltaProv,
  liquidationConvertedProv,
  stateAtBlockProv,
  stateChangeProv,
  tickPairProv,
  type LlamalendCoords,
} from "@/lib/llamalend/event-provenance";
import { formatDayMonth } from "@/lib/date";
import { formatExactDecimal, formatNumber } from "@/lib/utils/format";

const UNREAD = "Not read on this page";

const WORDS = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  seized: "Seized in liquidation",
  selfLiq: "Self-liquidation",
  borrow: "Borrow",
  repay: "Repay",
  cleared: "Cleared in liquidation",
  converted: (b: string) => `Converted ${b}`,
  sold: "Sold by the AMM since last event",
  health: "Health",
  firstBand: "Price to the first band",
  holdings: "What the AMM holds",
  rate: "Borrow rate",
  bands: "Bands",
  bandPrices: "Band prices",
  loanDiscount: "Loan discount",
  liqDiscount: "Liquidation discount",
  noLoan: "No loan",
  unreadAtBlock: "Not read at this block",
  noPrice: "No price read at this block",
};

/** Each row's read-more: what the figure is and where it is read. */
const TIPS = {
  collEvent: (c: string) =>
    `The ${c} this transaction moved into or out of the position, from the log's collateral field, valued at the AMM's oracle price at this block.`,
  convEvent: (b: string) =>
    `The change in the ${b} the AMM held for the position from collateral it had sold, read from the Controller at the block before and at this block.`,
  collLast: (c: string) => `The ${c} collateral the previous row's UserState stated once its transaction had run.`,
  sold: (c: string) =>
    `The ${c} the AMM sold from the position's bands between the previous event and this one: the collateral that row stated, less the collateral read at the block before this event.`,
  collBefore: (c: string) =>
    `The ${c} collateral just before this transaction, read from the Controller at the block before, valued at the AMM's oracle price at this block.`,
  collTotal: (c: string, b: string) =>
    `The collateral after this transaction, the ${c} in the bands and any ${b} the AMM holds from selling it, valued at the AMM's oracle price at this block.`,
  debtEvent: (b: string) => `The ${b} this transaction borrowed or repaid, from the log's loan field.`,
  debtBefore: (b: string) =>
    `The ${b} owed just before this transaction, read from the Controller at the block before.`,
  debtTotal: (b: string) => `The ${b} owed after this transaction, read from the Controller at this block.`,
  health:
    "The Controller's health for the position after this transaction, with the AMM's holdings counted; below 0 anyone may liquidate it.",
  firstBand: (c: string, b: string) =>
    `The ${c} price in ${b} at which the AMM starts selling the position's collateral, the top of its highest band, from the Controller at this block.`,
  holdings: (c: string, b: string) =>
    `What the AMM holds for the position after this transaction: the ${c} still in its bands and the ${b} from collateral it sold, from the Controller at this block.`,
  rate: "The yearly rate the market charged its borrowers at this block, set by the market's monetary policy.",
  bands: "The band ticks the position's collateral spreads over after this transaction, from the AMM at this block.",
  bandPrices: (c: string, b: string) =>
    `The ${c} price range of the position's bands in ${b}, top to bottom, from the Controller at this block.`,
  loanDiscount:
    "The discount the market takes off the collateral's value to set how much can be borrowed against it, one of the Controller's terms.",
  liqDiscount:
    "The discount health takes off this position's collateral value, stored when the loan last changed, from the Controller at this block.",
};

const n = (raw: string | null | undefined, decimals: number): number | null =>
  raw == null ? null : Number(raw) / 10 ** decimals;
const pct = (fraction: number) =>
  `${(fraction * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const signedText = (v: number, text: string) => `${v < 0 ? "−" : "+"}${text}`;
const healthPts = (a: number) =>
  `${(a * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pts`;
const DUST = 1e-12;

/** An amount valued at the AMM's oracle price at this block (crvUSD markets). */
function valuedProv(what: string, parts: { label: string; value: string }[], coords: LlamalendCoords): Provenance {
  return {
    kind: "chain-derived",
    pclass: "oracle",
    summary: `${what}, in US dollars — the collateral at the market's AMM oracle price (price_oracle, crvUSD per collateral) at block ${coords.blockNumber ?? "?"}, plus any crvUSD at its $1 face.`,
    formula: "collateral × oracle price + crvUSD",
    via: "GET /api/chain/llamalend/event-state · AMM.price_oracle() at this block",
    inputs: parts.map((p) => ({ label: p.label, value: p.value, kind: "chain" as const, pclass: "state" as const })),
  };
}

/** A borrowed-token figure (crvUSD) at its $1 face. */
const faceProv = (sym: string, what: string): Provenance => ({
  kind: "derived",
  summary: `${what} in US dollars — the ${sym} amount at its $1 face.`,
  formula: "amount × $1",
});

/** A figure in a market whose borrowed token is not crvUSD: stated in it. */
const inBorrowedProv = (what: string, b: string, parts: { label: string; value: string }[]): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `${what}, in ${b} — the collateral at the market's AMM oracle price (price_oracle, ${b} per collateral) at this block, plus any ${b} the AMM holds. This market borrows ${b}, so its figures stay in ${b}.`,
  formula: "collateral × oracle price + converted",
  inputs: parts.map((p) => ({ label: p.label, value: p.value, kind: "chain" as const, pclass: "state" as const })),
});

/** The sheet, from the read at block − 1 and at the event's block. */
export function llamalendSheet({
  ctx,
  state,
  f,
  coords,
  previousStated,
  collateralAddress,
  borrowedAddress,
}: {
  ctx: LlamalendContext;
  state: LlamalendEventState;
  f: LlamalendEventFigures;
  coords: LlamalendCoords;
  previousStated?: LlamalendPreviousStated | null;
  collateralAddress?: string;
  borrowedAddress?: string;
}): EventSheet {
  const c = ctx.collateralSymbol;
  const b = ctx.borrowedSymbol;
  const block = coords.blockNumber ?? 0;
  const usdMarket = ctx.borrowedIsCrvusd;
  const p = f.priceAfter;
  const isLiq = ctx.eventType === "liquidation";
  const isSelf = ctx.role === "self" || ctx.selfLiquidation === true;

  const collAfter = f.collAfter ?? 0;
  const convAfter = f.convAfter ?? 0;
  const collBefore = f.collBefore ?? 0;
  const convBefore = f.convBefore ?? 0;
  const debtAfter = f.debtAfter ?? 0;
  const debtBefore = f.debtBefore ?? 0;

  const collAmt = (text: string, info: Provenance, value?: string) => ({
    text,
    symbol: c,
    address: collateralAddress,
    info,
    value,
  });
  const borAmt = (text: string, info: Provenance, value?: string) => ({
    text,
    symbol: b,
    address: borrowedAddress,
    info,
    value,
  });
  // The collateral's price, as the sheet's other families print one.
  const priceNote =
    usdMarket && p != null
      ? `$${p.toLocaleString("en-US", p >= 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumSignificantDigits: 4 })}`
      : undefined;

  // ── Collateral ──
  const collRows: SheetRow[] = [];
  const emittedColl = ctx.collateralDelta != null ? Number(ctx.collateralDelta) : null;
  const collMove =
    emittedColl != null && emittedColl !== 0
      ? isLiq
        ? -Math.abs(emittedColl)
        : emittedColl
      : Math.abs(collAfter - collBefore) > Math.max(collBefore, collAfter, 1) * DUST && !isLiq
        ? collAfter - collBefore
        : 0;
  if (collMove !== 0) {
    const emitted = emittedColl != null && emittedColl !== 0;
    collRows.push({
      key: "event-collateral",
      label: isLiq ? (isSelf ? WORDS.selfLiq : WORDS.seized) : collMove > 0 ? WORDS.deposit : WORDS.withdraw,
      note: priceNote,
      amount: collAmt(
        `${collMove < 0 ? "−" : ""}${fmtColl(Math.abs(collMove))}`,
        emitted
          ? collateralDeltaProv(c, ctx.eventType, coords, ctx.raw?.collateralDelta)
          : stateChangeProv(`${c} collateral`, coords),
        `${collMove < 0 ? "−" : "+"}${formatExactDecimal(String(Math.abs(collMove)))}`,
      ),
      usd:
        usdMarket && p != null
          ? {
              text: sheetUsd(collMove * p),
              info: valuedProv(
                `The ${c} this transaction moved`,
                [
                  { label: "amount", value: `${formatExactDecimal(String(Math.abs(collMove)))} ${c}` },
                  { label: `${c} price`, value: `${p} ${b}` },
                ],
                coords,
              ),
            }
          : undefined,
      tip: TIPS.collEvent(c),
    });
  }
  // The borrowed token the AMM held, where the transaction moved it.
  const convTaken = isLiq && ctx.convertedTaken != null ? Math.abs(Number(ctx.convertedTaken)) : 0;
  const convMove = convTaken > 0 ? -convTaken : convAfter - convBefore;
  if (Math.abs(convMove) > Math.max(convBefore, convAfter, 1) * DUST) {
    collRows.push({
      key: "event-converted",
      label: WORDS.converted(b),
      amount: borAmt(
        signedText(convMove, formatNumber(Math.abs(convMove))).replace(/^\+/, ""),
        convTaken > 0
          ? liquidationConvertedProv(b, coords, ctx.raw?.convertedTaken)
          : stateChangeProv(`${b} converted`, coords),
        `${convMove < 0 ? "−" : "+"}${formatExactDecimal(String(Math.abs(convMove)))}`,
      ),
      usd: usdMarket
        ? { text: sheetUsd(convMove), info: faceProv(b, `The converted ${b} this transaction moved`) }
        : undefined,
      tip: TIPS.convEvent(b),
    });
  }

  const collCarry: SheetSide["carry"] = [];
  const sold = soldSincePrevious(previousStated, f);
  if (previousStated && f.hadLoan) {
    collCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: collAmt(fmtColl(previousStated.collateral), {
        kind: "chain",
        pclass: "state",
        summary: `${c} collateral at the last event — the previous row's UserState after-image on ${formatDayMonth(previousStated.timestamp)}, the position's absolute collateral once that transaction had run.`,
        via: "the previous row's UserState after-image",
      }),
      tip: TIPS.collLast(c),
    });
    if (sold != null)
      collCarry.push({
        key: "sold",
        label: WORDS.sold,
        amount: collAmt(`−${fmtColl(sold)}`, {
          kind: "chain-derived",
          pclass: "state",
          summary: `${c} the AMM sold from the position's bands since the ${formatDayMonth(previousStated.timestamp)} event — the collateral that row's UserState stated, less Controller.user_state(user)[0] at block ${block - 1}.`,
          formula: "last stated − collateral at block − 1",
        }),
        tip: TIPS.sold(c),
      });
  }
  const collBeforeValue = p != null ? collBefore * p + convBefore : null;
  const beforeParts = [
    { label: "collateral", value: `${formatExactDecimal(String(collBefore))} ${c}` },
    { label: "converted", value: `${formatExactDecimal(String(convBefore))} ${b}` },
    ...(p != null ? [{ label: `${c} price`, value: `${p} ${b}` }] : []),
  ];
  const collBeforeRow: SheetRow | undefined = f.hadLoan
    ? {
        key: "before",
        label: SHEET_WORDS.before,
        ...(convBefore > 0
          ? {}
          : {
              amount: collAmt(
                fmtColl(collBefore),
                stateAtBlockProv(
                  `${c} collateral`,
                  "Controller.user_state(user)[0]",
                  block - 1,
                  coords,
                  state.before.collateralRaw,
                ),
                formatExactDecimal(String(collBefore)),
              ),
            }),
        usd:
          collBeforeValue == null
            ? undefined
            : usdMarket
              ? {
                  text: sheetUsd(collBeforeValue),
                  info: valuedProv("The collateral just before this transaction", beforeParts, coords),
                }
              : convBefore > 0
                ? {
                    text: `${fmtPrice(collBeforeValue)} ${b}`,
                    info: inBorrowedProv("The collateral just before this transaction", b, beforeParts),
                  }
                : undefined,
        tip: TIPS.collBefore(c),
      }
    : undefined;

  const afterParts = [
    { label: "collateral", value: `${formatExactDecimal(String(collAfter))} ${c}` },
    { label: "converted", value: `${formatExactDecimal(String(convAfter))} ${b}` },
    ...(p != null ? [{ label: `${c} price`, value: `${p} ${b}` }] : []),
  ];
  const collValue = p != null ? collAfter * p + convAfter : null;
  const collSide: SheetSide = {
    side: "collateral",
    icons: [c, ...(convAfter > 0 || convBefore > 0 ? [b] : [])],
    carry: collCarry,
    before: collBeforeRow,
    rows: collRows,
    total:
      collValue == null
        ? { none: WORDS.noPrice }
        : usdMarket
          ? {
              text: collValue > 0 ? sheetUsd(collValue) : "$0",
              info: valuedProv("The collateral after this transaction", afterParts, coords),
            }
          : {
              text: `${fmtPrice(collValue)} ${b}`,
              info: inBorrowedProv("The collateral after this transaction", b, afterParts),
            },
    totalTip: TIPS.collTotal(c, b),
  };

  // ── Debt ──
  const debtRows: SheetRow[] = [];
  const emittedDebt = ctx.debtDelta != null ? Number(ctx.debtDelta) : null;
  const debtMove = emittedDebt != null && emittedDebt !== 0 ? (isLiq ? -Math.abs(emittedDebt) : emittedDebt) : 0;
  if (debtMove !== 0)
    debtRows.push({
      key: "event-debt",
      label: isLiq ? (isSelf ? WORDS.selfLiq : WORDS.cleared) : debtMove > 0 ? WORDS.borrow : WORDS.repay,
      amount: borAmt(
        `${debtMove < 0 ? "−" : ""}${formatNumber(Math.abs(debtMove))}`,
        debtDeltaProv(b, ctx.eventType, coords, ctx.raw?.debtDelta),
        `${debtMove < 0 ? "−" : "+"}${formatExactDecimal(String(Math.abs(debtMove)))}`,
      ),
      usd: usdMarket ? { text: sheetUsd(debtMove), info: faceProv(b, `The ${b} this transaction moved`) } : undefined,
      tip: TIPS.debtEvent(b),
    });
  const debtBeforeProv = stateAtBlockProv(
    `${b} debt`,
    "Controller.user_state(user)[2]",
    block - 1,
    coords,
    state.before.debtRaw,
  );
  const debtAfterProv =
    ctx.debtAfter != null
      ? afterImageProv(b, "debt", coords, ctx.raw?.debtAfter)
      : stateAtBlockProv(`${b} debt`, "Controller.user_state(user)[2]", block, coords, state.after.debtRaw);
  const debtSide: SheetSide = {
    side: "debt",
    icons: debtAfter > 0 || debtBefore > 0 ? [b] : [],
    carry: [],
    before: f.hadLoan
      ? {
          key: "before",
          label: SHEET_WORDS.before,
          amount: borAmt(formatNumber(debtBefore), debtBeforeProv, formatExactDecimal(String(debtBefore))),
          usd: usdMarket
            ? { text: sheetUsd(debtBefore), info: faceProv(b, "The debt just before this transaction") }
            : undefined,
          tip: TIPS.debtBefore(b),
        }
      : undefined,
    rows: debtRows,
    total: usdMarket
      ? { text: debtAfter > 0 ? sheetUsd(debtAfter) : "$0", info: debtAfterProv }
      : { text: `${formatNumber(debtAfter)} ${b}`, info: debtAfterProv },
    totalTip: TIPS.debtTotal(b),
  };

  // ── Risk ──
  const closed = !f.hasLoan;
  const hA = f.healthAfter;
  const hB = f.healthBefore;
  const pUpBefore = f.hadLoan ? n(state.before.pUpRaw, 18) : null;
  const pUp = f.pUpAfter;
  const risk: SheetStat[] = [
    {
      key: "health",
      label: WORDS.health,
      tip: TIPS.health,
      value:
        hA != null
          ? {
              text: fmtHealth(hA),
              info: stateAtBlockProv("Health", "Controller.health(user, true)", block, coords, state.after.healthRaw),
              value: `${hA * 100}%`,
            }
          : { none: closed ? WORDS.noLoan : WORDS.unreadAtBlock },
      tone: hA != null && hA < 0 ? "text-red-600 dark:text-red-400" : undefined,
      change:
        hA != null && hB != null
          ? { text: changeText(hA - hB, healthPts), info: stateChangeProv("health", coords) }
          : null,
    },
    {
      key: "first-band",
      label: WORDS.firstBand,
      tip: TIPS.firstBand(c, b),
      value:
        pUp != null
          ? {
              text: `${fmtBandPrice(pUp)} ${b}`,
              info: stateAtBlockProv(
                `${c} price at the top of the first band`,
                "Controller.user_prices(user)[0]",
                block,
                coords,
                state.after.pUpRaw,
              ),
              value: String(pUp),
            }
          : { none: closed ? WORDS.noLoan : WORDS.unreadAtBlock },
      change:
        pUp != null && pUpBefore != null
          ? {
              text: changeText(pUp - pUpBefore, (x) => `${fmtBandPrice(x)} ${b}`),
              info: stateChangeProv("the price at the top of the first band", coords),
            }
          : null,
    },
  ];
  // Health where the stat cannot state it: a closed loan's before, and a
  // liquidation's start of block where it crossed 0.
  const captions: ReactNode[] = [];
  if (closed && hB != null)
    captions.push(
      <span key="before">
        Health was{" "}
        <Prov
          info={stateAtBlockProv("Health", "Controller.health(user, true)", block - 1, coords, state.before.healthRaw)}
          value={`${hB * 100}%`}
        >
          {fmtHealth(hB)}
        </Prov>{" "}
        at the block before.{" "}
      </span>,
    );
  if (f.healthStart != null && hB != null && f.healthStart < 0 !== hB < 0)
    captions.push(
      <span key="start">
        Health was{" "}
        <Prov
          info={stateAtBlockProv("Health", "Controller.health(user, true)", block, coords)}
          value={`${f.healthStart * 100}%`}
        >
          {fmtHealth(f.healthStart)}
        </Prov>{" "}
        at the start of this block.
      </span>,
    );

  // ── Limits ──
  const holdings: SheetStat = {
    key: "amm-holdings",
    label: WORDS.holdings,
    tip: TIPS.holdings(c, b),
    value: f.hasLoan
      ? {
          text: (
            <>
              <Prov
                info={
                  ctx.collateralAfter != null
                    ? afterImageProv(c, "collateral", coords, ctx.raw?.collateralAfter)
                    : stateAtBlockProv(
                        `${c} collateral`,
                        "Controller.user_state(user)[0]",
                        block,
                        coords,
                        state.after.collateralRaw,
                      )
                }
                value={formatExactDecimal(String(collAfter))}
              >
                {fmtColl(collAfter)}
              </Prov>{" "}
              {c} /{" "}
              <Prov
                info={stateAtBlockProv(
                  `${b} converted`,
                  "Controller.user_state(user)[1]",
                  block,
                  coords,
                  state.after.convertedRaw,
                )}
                value={formatExactDecimal(String(convAfter))}
              >
                {formatNumber(convAfter)}
              </Prov>{" "}
              {b}
            </>
          ),
        }
      : { none: WORDS.noLoan },
  };
  const limits: SheetStat[] = [
    holdings,
    { key: "borrow-rate", label: WORDS.rate, tip: TIPS.rate, value: { none: UNREAD } },
  ];

  // ── Parameters ──
  const n1 = f.n1After ?? (ctx.n1 != null ? Number(ctx.n1) : null);
  const n2 = f.n2After ?? (ctx.n2 != null ? Number(ctx.n2) : null);
  const bandsMoved = n1 != null && f.n1Before != null && f.n1Before !== n1;
  const dB = f.hadLoan ? f.discountBefore : null;
  const dA = f.hasLoan ? n(state.after.liquidationDiscountRaw, 18) : null;
  const params: SheetStat[] = [
    {
      key: "bands",
      label: WORDS.bands,
      tip: TIPS.bands,
      value:
        n1 != null && n2 != null && f.hasLoan
          ? {
              text: `${n1} … ${n2} · ${Math.abs(n2 - n1) + 1} bands`,
              info:
                ctx.n1 != null && ctx.n2 != null
                  ? tickPairProv(coords, ctx.n1, ctx.n2)
                  : stateAtBlockProv("Band ticks", "AMM.read_user_tick_numbers(user)", block, coords),
              value: `${n1} … ${n2}`,
            }
          : { none: closed ? WORDS.noLoan : WORDS.unreadAtBlock },
      change:
        bandsMoved && n1 != null
          ? {
              text: changeText(n1 - (f.n1Before ?? 0), (x) => `${x} ${x === 1 ? "tick" : "ticks"}`),
              info: stateChangeProv("the band ticks", coords),
            }
          : null,
    },
    {
      key: "band-prices",
      label: WORDS.bandPrices,
      tip: TIPS.bandPrices(c, b),
      value:
        f.pUpAfter != null && f.pDownAfter != null
          ? {
              text: `${fmtBandPrice(f.pUpAfter)} → ${fmtBandPrice(f.pDownAfter)} ${b}`,
              info: stateAtBlockProv("Band prices", "Controller.user_prices(user)", block, coords),
              value: `${f.pUpAfter} → ${f.pDownAfter}`,
            }
          : { none: closed ? WORDS.noLoan : WORDS.unreadAtBlock },
    },
    { key: "loan-discount", label: WORDS.loanDiscount, tip: TIPS.loanDiscount, value: { none: UNREAD } },
    {
      key: "liquidation-discount",
      label: WORDS.liqDiscount,
      tip: TIPS.liqDiscount,
      value:
        dA != null
          ? {
              text: pct(dA),
              info: stateAtBlockProv(
                "Liquidation discount",
                "Controller.liquidation_discounts(user)",
                block,
                coords,
                state.after.liquidationDiscountRaw,
              ),
              value: String(dA),
            }
          : { none: closed ? WORDS.noLoan : WORDS.unreadAtBlock },
      change:
        dA != null && dB != null && Math.abs(dA - dB) > DUST
          ? {
              text: changeText(dA - dB, (x) => `${(x * 100).toFixed(2)} pts`),
              info: stateChangeProv("the liquidation discount", coords),
            }
          : null,
    },
  ];

  return {
    sides: [collSide, debtSide],
    panels: [
      { panel: "risk", rows: risk, caption: captions.length > 0 ? <>{captions}</> : undefined },
      { panel: "limits", rows: limits, breakdown: params },
    ],
  };
}
