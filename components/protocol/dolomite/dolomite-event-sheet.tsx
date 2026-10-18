"use client";

// Dolomite's T2 as a balance sheet (rails-ops TO-DO-ui-jobs 330), from the
// page's replay of the account (lib/dolomite/flows.ts over lib/shared/
// ctoken-flows.ts `ctokenEventStates`, handed down through
// `CTokenLedgerContext`): the figures the account cells state, laid out as the
// shared sheet (components/shared/event-sheet.tsx) the way Moonwell's
// replay-driven sheet lays them out. A Dolomite balance is signed per market:
// above zero it sits on the Collateral side, below zero on the Debt side.
//
// Per side: the account's total once the previous transaction had run ("Last
// event"), each market's interest since it, the market move between them, the
// total before this transaction, each market the transaction moved, and the
// total after. With the breakdown on, the Debt side lists every market owed
// and the ones repaid. Risk (margin ratio, how far the collateral can fall)
// and Limits (borrowing limit used, still borrowable, the minimum margin and
// each market's margin premium) need the core's adjusted values at the
// event's block, which the page does not read: their rows stand with their
// labels and tips, unread.

import { useContext } from "react";
import type { Provenance } from "@/components/shared/provenance";
import {
  SHEET_WORDS,
  sheetUsd,
  type EventSheet,
  type SheetRow,
  type SheetSide,
  type SheetStat,
} from "@/components/shared/event-sheet";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { CTokenLedgerContext } from "@/components/shared/ctoken-event-ledger";
import { fmtPositionAmount } from "@/components/shared/position-row";
import type { CTokenEventState } from "@/lib/shared/ctoken-flows";
import type { FlowSide } from "@/lib/shared/flows-timeline";
import type { DolomiteContext } from "@/lib/shared/types/event-shape";
import { balanceChangeProv, type DolomiteCoords } from "@/lib/dolomite/event-provenance";
import type { DolomiteEvent } from "@/lib/dolomite/explainer-clauses";
import { decimalSub, formatExactDecimal } from "@/lib/utils/format";

const DUST = 1e-9;

const WORDS = {
  margin: "Margin ratio",
  fall: "Collateral can fall",
  limit_used: "Borrowing limit used",
  borrowable: "Still borrowable",
  min_margin: "Minimum margin",
  premium: (sym: string) => `${sym} margin premium`,
  unread: "Not read on this page",
  no_price: "A market here has no price",
};

const sideWords = (side: FlowSide) =>
  side === "collateral"
    ? { name: "collateral", act: "earned", held: "supplied", bal: "its par times the market's supply index" }
    : { name: "debt", act: "accrued", held: "borrowed", bal: "its par below zero times the market's borrow index" };

/** Each row's read-more: what the figure is and where it is read. */
const TIPS = {
  last: (side: FlowSide) =>
    `The ${sideWords(side).name}'s total in dollars once the previous transaction on this timeline had run, from the balance rows the page replays.`,
  interest: (side: FlowSide) =>
    `The interest every ${sideWords(side).held} market ${sideWords(side).act} between the previous event and this one, at Dolomite's latest oracle prices by this event.`,
  interestAsset: (side: FlowSide, sym: string) =>
    `The ${sym} the ${side === "collateral" ? "supply earned" : "debt accrued"} since the previous event: the balance just before this transaction less the balance after the previous one.`,
  market: (side: FlowSide) =>
    `The change Dolomite's oracle prices made to the dollar value of the ${sideWords(side).name} held between the previous event and this one.`,
  before: (side: FlowSide) =>
    `The ${sideWords(side).name}'s total in dollars just before this transaction, each market's balance at Dolomite's latest oracle price by this event.`,
  event: (side: FlowSide, sym: string) =>
    `The ${sym} this transaction moved on the ${sideWords(side).held} side, the balance after less before at this block's index, at Dolomite's latest ${sym} oracle price by this event.`,
  asset: (sym: string) =>
    `The ${sym} owed after this transaction, its par below zero times the market's borrow index, at Dolomite's latest ${sym} oracle price by this event.`,
  repaid: "The assets this account once borrowed and owes none of after this event.",
  total: (side: FlowSide) =>
    `The ${sideWords(side).name}'s total in dollars after this transaction: each ${side === "collateral" ? "balance above zero" : "balance below zero"}, ${sideWords(side).bal}, at Dolomite's latest oracle price by this event. Where the side holds one market, its amount stands beside the dollars.`,
  margin:
    "The account's supply over its debt after this event, each adjusted by its market's margin premium, as the core's getAdjustedAccountValues states them; at the minimum margin the account can be liquidated.",
  fall: "How far the collateral's total value can fall, the debt's value held, before the margin ratio reaches the minimum margin: one less the minimum over the margin ratio.",
  limit_used:
    "The adjusted debt as a share of the borrowing limit, the adjusted supply over the minimum margin; Dolomite liquidates the account at 100%.",
  borrowable:
    "What the account could still borrow in dollars after this event before its margin ratio reaches the minimum margin, the markets' margin premiums counted.",
  min_margin:
    "The lowest margin ratio the account may hold: one plus the core's getMarginRatioForAccount, the account's risk override where one is set.",
  premium: (sym: string) =>
    `The ${sym} market's margin premium from the core's getMarketMarginPremium, set by governance: it raises the margin a ${sym} balance needs on either side.`,
};

/** "$0.9997": a price as the sub-rows print it. */
const priceWords = (p: number | null) =>
  p == null
    ? undefined
    : `$${p.toLocaleString("en-US", p < 10 ? { minimumFractionDigits: 4, maximumFractionDigits: 4 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const usdText = (v: number) => (Math.abs(v) < 0.005 ? "$0" : sheetUsd(v));

/** A side's dollars once a transaction had run, or just before it. */
function heldProv(side: FlowSide, when: "after" | "before" | "previous"): Provenance {
  const what = side === "collateral" ? "Collateral" : "Debt";
  const at =
    when === "previous"
      ? "once the previous transaction on this timeline had run"
      : when === "before"
        ? "just before this transaction ran"
        : "once this transaction had run";
  return {
    kind: "chain-derived",
    summary: `${what} ${when === "previous" ? "at the last event" : `${when} this event`} — what the account ${side === "collateral" ? "supplied" : "owed"} ${at}, in USD: each market's balance ${side === "collateral" ? "above zero (the par × the market's supply index)" : "below zero (the par × the market's borrow index)"} as its rows recorded it, a market the transaction left alone grown by its interest since its last event, each at Dolomite's oracle price of its latest priced event.`,
    formula: "Σ balance × price",
  };
}

/** A token figure's dollars at the price the replay values it at. */
const atPriceUsdProv = (sym: string, what: string, amount: number, price: number): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `${what}, in US dollars — the amount times Dolomite's oracle price for ${sym} of its latest priced event.`,
  formula: "amount × price",
  inputs: [
    { label: "amount", value: `${fmtPositionAmount(amount)} ${sym}`, kind: "chain-derived", pclass: "indexed" },
    { label: `${sym} price`, value: `$${price}`, kind: "chain", pclass: "oracle" },
  ],
});

/** A market's balance change across the transaction, where no single leg
 *  states it. */
const changeProv = (side: FlowSide, sym: string): Provenance => ({
  kind: "chain-derived",
  summary: `${sym} ${side === "collateral" ? "supply" : "debt"} change at this event — the balance once the transaction had run less the balance just before it, as the market's rows state them.`,
  formula: "after − before",
});

/** A market's balance once the transaction had run. */
const balanceProv = (side: FlowSide, sym: string): Provenance => ({
  kind: "chain-derived",
  summary: `${sym} ${side === "collateral" ? "supplied" : "owed"} after this event — the market's balance ${side === "collateral" ? "above zero (the par × the supply index at the block)" : "below zero (the par × the borrow index at the block)"} as the row states it, or grown by its index to the block where the transaction left it alone.`,
});

const interestProv = (side: FlowSide, sym: string): Provenance => ({
  kind: "chain-derived",
  summary: `${sym} interest since the last event — the ${side === "collateral" ? "supply" : "debt"} just before this transaction less the ${side === "collateral" ? "supply" : "debt"} once the previous transaction had run, as the market's rows state them; a market neither transaction touched is grown along its index.`,
  formula: "before this event − after the last event",
});

const mag = (v: string) => v.replace(/^-/, "");

/** The exact change one leg of the transaction states for its market, where
 *  that leg alone moved the market on this side by the replay's figure: the
 *  cell's receipt and digits. */
function legChange(
  legs: DolomiteContext[],
  side: FlowSide,
  sym: string,
  change: number,
  coords: DolomiteCoords,
): { info: Provenance; value: string } | null {
  const on = legs.filter((c) => c.marketSymbol === sym);
  if (on.length !== 1) return null;
  const c = on[0];
  if (c.balanceAfter == null || c.balanceBefore == null) return null;
  const a = Number(c.balanceAfter);
  const b = Number(c.balanceBefore);
  let exact: string | null;
  if (side === "collateral" && a >= 0 && b >= 0) exact = decimalSub(c.balanceAfter, c.balanceBefore);
  else if (side === "debt" && a <= 0 && b <= 0) exact = decimalSub(mag(c.balanceAfter), mag(c.balanceBefore));
  else return null;
  if (exact == null) return null;
  const n = Number(exact);
  if (!Number.isFinite(n) || Math.abs(n - change) > Math.max(1e-6, Math.abs(change) * 1e-6)) return null;
  return {
    info: balanceChangeProv(sym, { ...coords, marketId: c.marketId }),
    value: `${n < 0 ? "−" : "+"}${formatExactDecimal(mag(exact))}`,
  };
}

/** One side's panel. */
function sheetSide(
  side: FlowSide,
  state: CTokenEventState,
  prev: CTokenEventState | null,
  legs: { ctx: DolomiteContext; label: string }[],
  label: string,
  coords: DolomiteCoords,
  addresses: Record<string, string> | undefined,
  repaid: string[] | undefined,
): SheetSide {
  const balances = state.balances[side];
  const moved = state.moved[side]
    ? balances.filter((b) => Math.abs(b.amount - b.before) > Math.max(DUST, Math.abs(b.before) * 1e-12))
    : [];
  const addr = (sym: string) => addresses?.[sym] ?? legs.find((l) => l.ctx.marketSymbol === sym)?.ctx.marketToken;
  const ctxs = legs.map((l) => l.ctx);

  const rows: SheetRow[] = moved.map((b) => {
    const c = b.amount - b.before;
    const exact = legChange(ctxs, side, b.symbol, c, coords);
    // The row takes the word of the leg that moved its market.
    const word = legs.find((l) => l.ctx.marketSymbol === b.symbol)?.label ?? label;
    return {
      key: `event-${b.symbol}`,
      label: moved.length > 1 ? `${word} · ${b.symbol}` : word,
      amount: {
        text: `${c < 0 ? "−" : ""}${fmtPositionAmount(Math.abs(c))}`,
        symbol: b.symbol,
        address: addr(b.symbol),
        info: exact?.info ?? changeProv(side, b.symbol),
        value: exact?.value,
      },
      usd:
        b.price != null
          ? {
              text: sheetUsd(c * b.price),
              info: atPriceUsdProv(b.symbol, `The ${b.symbol} this transaction moved`, Math.abs(c), b.price),
            }
          : undefined,
      tip: TIPS.event(side, b.symbol),
    };
  });

  // The carry-forward layer, where the page holds the previous transaction.
  const carry: SheetSide["carry"] = [];
  const held = state.held[side];
  const heldBefore = state.heldBefore[side];
  const last = prev?.held[side] ?? null;
  if (prev && last != null && heldBefore != null && (last > 0.005 || heldBefore > 0.005)) {
    carry.push({
      key: "last",
      label: SHEET_WORDS.last,
      usd: { text: usdText(last), info: heldProv(side, "previous") },
      tip: TIPS.last(side),
    });
    const then = new Map(prev.balances[side].map((b) => [b.symbol, b]));
    let interestUsd = 0;
    let priced = true;
    const sub: SheetRow[] = [];
    for (const b of balances) {
      const p = then.get(b.symbol);
      if (!p) continue;
      const i = b.before - p.amount;
      if (!(Math.abs(i) > Math.max(DUST, Math.abs(b.before) * 1e-9))) continue;
      const v = b.price != null ? i * b.price : null;
      if (v == null) priced = false;
      else interestUsd += v;
      sub.push({
        key: `interest-${b.symbol}`,
        label: b.symbol,
        note: priceWords(b.price),
        amount: {
          text: `${i < 0 ? "−" : ""}${fmtPositionAmount(Math.abs(i))}`,
          symbol: b.symbol,
          address: addr(b.symbol),
          info: interestProv(side, b.symbol),
        },
        usd:
          v != null
            ? {
                text: sheetUsd(v),
                info: atPriceUsdProv(b.symbol, `Interest on ${b.symbol} since the last event`, Math.abs(i), b.price!),
              }
            : undefined,
        tip: TIPS.interestAsset(side, b.symbol),
      });
    }
    if (sub.length > 0)
      carry.push({
        key: "interest",
        label: SHEET_WORDS.interest,
        usd: priced
          ? {
              text: sheetUsd(interestUsd),
              info: {
                kind: "chain-derived",
                pclass: "oracle",
                summary: `Interest on the ${side} since the last event, in US dollars — every market's interest at Dolomite's oracle price of its latest priced event, added up.`,
                formula: "Σ interest × price",
              },
            }
          : undefined,
        tip: TIPS.interest(side),
        sub,
      });
    // The market move: the rest of the change in the side's dollars, which
    // the prices moved; its receipt names each market's price at both events.
    if (priced) {
      const move = heldBefore - last - interestUsd;
      if (Math.abs(move) >= 0.005)
        carry.push({
          key: "market",
          label: SHEET_WORDS.market,
          usd: {
            text: sheetUsd(move, true),
            info: {
              kind: "chain-derived",
              pclass: "oracle",
              summary: `Market move on the ${side} since the last event — the side's total before this transaction, less its total once the previous transaction had run and the interest since, all in US dollars: the change Dolomite's oracle prices made to the balances held between the two. No token moved.`,
              formula: "before this event − last event − interest since",
              inputs: balances
                .filter((b) => then.has(b.symbol))
                .flatMap((b) => {
                  const pThen = then.get(b.symbol)!.price;
                  return [
                    ...(pThen != null
                      ? [
                          {
                            label: `${b.symbol} price at the last event`,
                            value: `$${pThen}`,
                            kind: "chain" as const,
                            pclass: "oracle" as const,
                          },
                        ]
                      : []),
                    ...(b.price != null
                      ? [
                          {
                            label: `${b.symbol} price at this event`,
                            value: `$${b.price}`,
                            kind: "chain" as const,
                            pclass: "oracle" as const,
                          },
                        ]
                      : []),
                  ];
                }),
            },
          },
          tip: TIPS.market(side),
        });
    }
  }
  const before: SheetRow | undefined =
    carry.length > 0 && heldBefore != null
      ? {
          key: "before",
          label: SHEET_WORDS.before,
          usd: { text: usdText(heldBefore), info: heldProv(side, "before") },
          tip: TIPS.before(side),
        }
      : undefined;

  const after = balances.filter((b) => b.amount > DUST);
  const assets: SheetRow[] | undefined =
    side === "debt"
      ? after.map((b) => ({
          key: `asset-${b.symbol}`,
          label: b.symbol,
          note: priceWords(b.price),
          amount: {
            text: fmtPositionAmount(b.amount),
            symbol: b.symbol,
            address: addr(b.symbol),
            info: balanceProv(side, b.symbol),
          },
          usd:
            b.price != null
              ? {
                  text: usdText(b.amount * b.price),
                  info: atPriceUsdProv(b.symbol, `The ${b.symbol} owed after this event`, b.amount, b.price),
                }
              : undefined,
          tip: TIPS.asset(b.symbol),
        }))
      : undefined;

  // One market held after the transaction, or none after it emptied the one it
  // moved: the total states its amount (decision 0042, point 9).
  const sole = after.length === 1 ? after[0] : after.length === 0 && moved.length === 1 ? moved[0] : undefined;

  return {
    side,
    icons: after.map((b) => b.symbol),
    carry,
    before,
    rows,
    ...(side === "debt" ? { assets, repaid, repaidTip: TIPS.repaid } : {}),
    total: held != null ? { text: usdText(held), info: heldProv(side, "after") } : { none: WORDS.no_price },
    totalAmount: sole && {
      text: fmtPositionAmount(sole.amount > DUST ? sole.amount : 0),
      symbol: sole.symbol,
      address: addr(sole.symbol),
      info: balanceProv(side, sole.symbol),
    },
    totalTip: TIPS.total(side),
  };
}

/** The sheet of a Dolomite event: `undefined` where the page does not tie its
 *  timeline to the Lifetime flows panel, on a protocol call (it moves no
 *  balance) or where the replay holds no state for the row (the cells
 *  stand), `null` while the replay is on its way. */
export function useDolomiteSheet({
  event,
  siblings,
  coords,
}: {
  event: DolomiteEvent;
  /** The transaction's legs on this account, this one included. */
  siblings: DolomiteEvent[];
  coords: DolomiteCoords;
}): EventSheet | null | undefined {
  const focus = useFlowFocus();
  const data = useContext(CTokenLedgerContext);
  const ctx = event.context.data;
  if (!focus || !data || ctx.eventType === "call") return undefined;
  const model = focus.model;
  if (!model || !data.states) return null;
  const state = data.states.get(event.id);
  if (!state) return undefined;

  // The previous transaction on the timeline, and the debt assets the page's
  // flows moved up to this event that the account owes none of after it.
  const at = focus.events.findIndex((e) => e.id === event.id);
  let prev: CTokenEventState | null = null;
  let repaid: string[] | undefined;
  if (at >= 0) {
    const tx = focus.events[at].tx ?? event.id;
    for (let k = at - 1; k >= 0; k--) {
      const e = focus.events[k];
      if ((e.tx ?? e.id) === tx) continue;
      prev = data.states.get(e.id) ?? null;
      break;
    }
    const debtLines = new Set(model.buckets.filter((b) => b.side === "debt").map((b) => b.key));
    const owes = new Set(state.balances.debt.filter((b) => b.amount > DUST).map((b) => b.symbol));
    const once = new Set<string>();
    let end = at;
    while (
      end + 1 < focus.events.length &&
      focus.events[end + 1].tx &&
      focus.events[end + 1].tx === focus.events[at].tx
    )
      end++;
    for (const e of focus.events.slice(0, end + 1))
      for (const l of e.legs) if (l.symbol && !l.accrual && debtLines.has(l.bucket)) once.add(l.symbol);
    repaid = [...once].filter((s) => !owes.has(s));
  }

  // The transaction's balance legs on this account, each with its word.
  const legs = siblings
    .filter((s) => s.txHash === event.txHash && s.context.data.eventType !== "call")
    .map((s) => ({ ctx: s.context.data, label: s.actionLabel }));
  if (!legs.some((l) => l.ctx === ctx)) legs.push({ ctx, label: event.actionLabel });

  const sides = (["collateral", "debt"] as const).map((side) =>
    sheetSide(
      side,
      state,
      prev,
      legs,
      event.actionLabel,
      coords,
      model.addresses,
      side === "debt" ? repaid : undefined,
    ),
  );

  // Risk and Limits: the core's adjusted values and margin parameters at the
  // event's block, which the page does not read.
  const unread = { none: WORDS.unread };
  const risk: SheetStat[] = [
    { key: "margin-ratio", label: WORDS.margin, tip: TIPS.margin, value: unread },
    { key: "collateral-can-fall", label: WORDS.fall, tip: TIPS.fall, value: unread },
  ];
  const limits: SheetStat[] = [
    { key: "limit-used", label: WORDS.limit_used, tip: TIPS.limit_used, value: unread },
    { key: "borrowable", label: WORDS.borrowable, tip: TIPS.borrowable, value: unread },
  ];
  const held = [...state.balances.collateral, ...state.balances.debt]
    .filter((b) => b.amount > DUST)
    .map((b) => b.symbol);
  const params: SheetStat[] = [
    { key: "minimum-margin", label: WORDS.min_margin, tip: TIPS.min_margin, value: unread },
    ...[...new Set(held)].map((sym) => ({
      key: `margin-premium-${sym}`,
      label: WORDS.premium(sym),
      tip: TIPS.premium(sym),
      value: unread,
    })),
  ];
  return {
    sides,
    panels: [
      { panel: "risk", rows: risk },
      { panel: "limits", rows: limits, breakdown: params },
    ],
  };
}
