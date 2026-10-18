"use client";

// Moonwell's T2 as a balance sheet (rails-ops TO-DO-ui-jobs 330), from the
// page's replay of the account (lib/shared/ctoken-flows.ts `ctokenEventStates`,
// handed down through `CTokenLedgerContext`): the figures the ledger cells
// state (components/shared/ctoken-event-ledger.tsx), laid out as the shared
// sheet (components/shared/event-sheet.tsx) the way the Aave family's
// multi-asset sheet lays them out.
//
// Per side: the account's total once the previous transaction had run ("Last
// event"), each market's interest since it, the market move between them (the
// rest of the change in the side's dollars), the total before this
// transaction, each market the transaction moved, and the total after. With
// the breakdown on, the Debt side lists every market owed and the ones repaid.
// Risk (health factor, how far the collateral can fall) and Limits (borrowing
// limit used, still borrowable, each collateral factor) need the Comptroller
// at the event's block, which the page does not read: their rows stand with
// their labels and tips, unread.

import type { Provenance } from "@/components/shared/provenance";
import {
  SHEET_WORDS,
  sheetUsd,
  type EventSheet,
  type SheetRow,
  type SheetSide,
  type SheetStat,
} from "@/components/shared/event-sheet";
import { useContext } from "react";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { CTokenLedgerContext } from "@/components/shared/ctoken-event-ledger";
import { fmtPositionAmount } from "@/components/shared/position-row";
import type { CTokenEventState } from "@/lib/shared/ctoken-flows";
import type { AssetBalance } from "@/lib/shared/flow-focus";
import type { FlowSide } from "@/lib/shared/flows-timeline";
import type { MoonwellContext } from "@/lib/shared/types/event-shape";
import { MOONWELL_WORDS, PROSE } from "@/lib/moonwell/event-templates";
import {
  assetsDeltaProv,
  liqDebtRepaidProv,
  supplyChangeProv,
  type MoonwellCoords,
} from "@/lib/moonwell/event-provenance";
import { decimalSub } from "@/lib/utils/format";

const DUST = 1e-9;
const { fillText } = PROSE;

/** Each row's read-more (the strings file's words, tip_*). */
const TIPS: Record<
  FlowSide,
  Record<"last" | "interest" | "market" | "before" | "total", string> & {
    event: (symbol: string) => string;
    interestAsset: (symbol: string) => string;
  }
> = {
  collateral: {
    last: MOONWELL_WORDS.tip_coll_last,
    interest: MOONWELL_WORDS.tip_coll_interest,
    market: MOONWELL_WORDS.tip_coll_market,
    before: MOONWELL_WORDS.tip_coll_before,
    total: MOONWELL_WORDS.tip_coll_total,
    event: (symbol) => fillText(MOONWELL_WORDS.tip_coll_event, { symbol }),
    interestAsset: (symbol) => fillText(MOONWELL_WORDS.tip_coll_interest_asset, { symbol }),
  },
  debt: {
    last: MOONWELL_WORDS.tip_debt_last,
    interest: MOONWELL_WORDS.tip_debt_interest,
    market: MOONWELL_WORDS.tip_debt_market,
    before: MOONWELL_WORDS.tip_debt_before,
    total: MOONWELL_WORDS.tip_debt_total,
    event: (symbol) => fillText(MOONWELL_WORDS.tip_debt_event, { symbol }),
    interestAsset: (symbol) => fillText(MOONWELL_WORDS.tip_debt_interest_asset, { symbol }),
  },
};
const debtAssetTip = (symbol: string) => fillText(MOONWELL_WORDS.tip_debt_asset, { symbol });

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
    summary: `${what} ${when === "previous" ? "at the last event" : `${when} this event`} — what the account ${side === "collateral" ? "supplied" : "owed"} ${at}, in USD: each market's ${side === "collateral" ? "supply (mTokens × the exchange rate)" : "debt (accountBorrows)"} as its rows recorded it, a market the transaction left alone grown by its interest since its last event, each at Moonwell's oracle price of its latest priced event.`,
    formula: "Σ balance × price",
  };
}

/** A token figure's dollars at the price the replay values it at. */
const atPriceUsdProv = (sym: string, what: string, amount: number, price: number): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `${what}, in US dollars — the amount times Moonwell's oracle price for ${sym} of its latest priced event.`,
  formula: "amount × price",
  inputs: [
    { label: "amount", value: `${fmtPositionAmount(amount)} ${sym}`, kind: "chain-derived", pclass: "indexed" },
    { label: `${sym} price`, value: `$${price}`, kind: "chain", pclass: "oracle" },
  ],
});

/** A market's balance change across the transaction. */
const changeProv = (side: FlowSide, sym: string): Provenance => ({
  kind: "chain-derived",
  summary: `${sym} ${side === "collateral" ? "supply" : "debt"} change at this event — the balance once the transaction had run less the balance just before it, as the market's rows state them.`,
  formula: "after − before",
});

/** A market's balance once the transaction had run. */
const balanceProv = (side: FlowSide, sym: string): Provenance => ({
  kind: "chain-derived",
  summary: `${sym} ${side === "collateral" ? "supplied" : "owed"} after this event — the market's ${side === "collateral" ? "supply (the mToken balance × the exchange rate at the block)" : "debt (the emitted accountBorrows)"} as the row states it, or grown by its index to the block where the transaction left it alone.`,
});

const interestProv = (side: FlowSide, sym: string): Provenance => ({
  kind: "chain-derived",
  summary: `${sym} interest since the last event — the ${side === "collateral" ? "supply" : "debt"} just before this transaction less the ${side === "collateral" ? "supply" : "debt"} once the previous transaction had run, as the market's rows state them; a market neither transaction touched is grown along its index, interpolated between the rows that state it.`,
  formula: "before this event − after the last event",
});

/** The exact change the event's row states, where the transaction moved
 *  its market by that amount alone: the cell's receipt and figure. */
function rowChange(
  ctx: MoonwellContext,
  side: FlowSide,
  sym: string,
  change: number,
  coords: MoonwellCoords,
): { info: Provenance; value: string } | null {
  if (sym !== ctx.marketSymbol) return null;
  const mSym = coords.marketLabel ?? `m${ctx.marketSymbol}`;
  let exact: string | null = null;
  let info: Provenance | null = null;
  if (side === "collateral" && ctx.side === "supply" && ctx.supplyAfter != null && ctx.supplyBefore != null) {
    exact = decimalSub(ctx.supplyAfter, ctx.supplyBefore);
    info = supplyChangeProv(ctx.marketSymbol, mSym, coords);
  } else if (side === "debt" && ctx.assetsDelta != null) {
    if (ctx.eventType === "borrow" || ctx.eventType === "repay") {
      exact = ctx.assetsDelta;
      info = assetsDeltaProv(ctx.marketSymbol, ctx.eventType, coords, ctx.raw?.amount);
    } else if (ctx.eventType === "liquidation") {
      exact = `-${ctx.assetsDelta.replace(/^-/, "")}`;
      info = liqDebtRepaidProv(ctx.marketSymbol, coords, ctx.raw?.amount);
    }
  }
  if (exact == null || info == null) return null;
  const n = Number(exact);
  if (!Number.isFinite(n) || Math.abs(n - change) > Math.max(1e-6, Math.abs(change) * 1e-6)) return null;
  return { info, value: exact.startsWith("-") ? `−${exact.slice(1)}` : `+${exact}` };
}

/** One side's panel. */
function sheetSide(
  side: FlowSide,
  state: CTokenEventState,
  prev: CTokenEventState | null,
  ctx: MoonwellContext,
  coords: MoonwellCoords,
  label: string,
  addresses: Record<string, string> | undefined,
  repaid: string[] | undefined,
): SheetSide {
  const balances = state.balances[side];
  const moved = state.moved[side]
    ? balances.filter((b) => Math.abs(b.amount - b.before) > Math.max(DUST, Math.abs(b.before) * 1e-12))
    : [];
  const addr = (sym: string) => addresses?.[sym];

  const rows: SheetRow[] = moved.map((b) => {
    const c = b.amount - b.before;
    const exact = rowChange(ctx, side, b.symbol, c, coords);
    return {
      key: `event-${b.symbol}`,
      label: moved.length > 1 ? `${label} · ${b.symbol}` : label,
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
      tip: TIPS[side].event(b.symbol),
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
      tip: TIPS[side].last,
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
        tip: TIPS[side].interestAsset(b.symbol),
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
                summary: `Interest on the ${side} since the last event, in US dollars — every market's interest at Moonwell's oracle price of its latest priced event, added up.`,
                formula: "Σ interest × price",
              },
            }
          : undefined,
        tip: TIPS[side].interest,
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
              summary: `Market move on the ${side} since the last event — the side's total before this transaction, less its total once the previous transaction had run and the interest since, all in US dollars: the change Moonwell's oracle prices made to the balances held between the two. No token moved.`,
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
          tip: TIPS[side].market,
        });
    }
  }
  const before: SheetRow | undefined =
    carry.length > 0 && heldBefore != null
      ? {
          key: "before",
          label: SHEET_WORDS.before,
          usd: { text: usdText(heldBefore), info: heldProv(side, "before") },
          tip: TIPS[side].before,
        }
      : undefined;

  const after = balances.filter((b) => b.amount > DUST);
  const assets: SheetRow[] | undefined =
    side === "debt"
      ? after.map((b: AssetBalance) => ({
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
          tip: debtAssetTip(b.symbol),
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
    ...(side === "debt" ? { assets, repaid, repaidTip: MOONWELL_WORDS.tip_debt_repaid } : {}),
    total:
      held != null ? { text: usdText(held), info: heldProv(side, "after") } : { none: MOONWELL_WORDS.sheet_no_price },
    totalAmount: sole && {
      text: fmtPositionAmount(sole.amount > DUST ? sole.amount : 0),
      symbol: sole.symbol,
      address: addr(sole.symbol),
      info: balanceProv(side, sole.symbol),
    },
    totalTip: TIPS[side].total,
  };
}

/** The sheet of a Moonwell event: `undefined` where the page does not tie its
 *  timeline to the Lifetime flows panel (the cells stand), `null` while the
 *  replay is on its way. */
export function useMoonwellSheet({
  ctx,
  eventId,
  label,
  coords,
}: {
  ctx: MoonwellContext;
  eventId: string;
  /** The event's word ("Supply"), naming its rows. */
  label: string;
  coords: MoonwellCoords;
}): EventSheet | null | undefined {
  const focus = useFlowFocus();
  const data = useContext(CTokenLedgerContext);
  if (!focus || !data) return undefined;
  const model = focus.model;
  const state = model ? data.states?.get(eventId) : undefined;
  if (!model || !data.states) return null;
  if (!state) return undefined;

  // The previous transaction on the timeline, and the debt assets the page's
  // flows moved up to this event that the account owes none of after it.
  const at = focus.events.findIndex((e) => e.id === eventId);
  let prev: CTokenEventState | null = null;
  let repaid: string[] | undefined;
  if (at >= 0) {
    const tx = focus.events[at].tx ?? eventId;
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

  const addresses = model.addresses;
  const sides = (["collateral", "debt"] as const).map((side) =>
    sheetSide(side, state, prev, ctx, coords, label, addresses, side === "debt" ? repaid : undefined),
  );

  // Risk and Limits: the Comptroller at the event's block, which the page
  // does not read.
  const unread = { none: MOONWELL_WORDS.sheet_unread };
  const risk: SheetStat[] = [
    { key: "health-factor", label: MOONWELL_WORDS.sheet_health, tip: MOONWELL_WORDS.tip_health, value: unread },
    { key: "collateral-can-fall", label: MOONWELL_WORDS.sheet_fall, tip: MOONWELL_WORDS.tip_fall, value: unread },
  ];
  const limits: SheetStat[] = [
    { key: "limit-used", label: MOONWELL_WORDS.sheet_limit_used, tip: MOONWELL_WORDS.tip_limit_used, value: unread },
    { key: "borrowable", label: MOONWELL_WORDS.sheet_borrowable, tip: MOONWELL_WORDS.tip_borrowable, value: unread },
  ];
  const params: SheetStat[] = state.balances.collateral
    .filter((b) => b.amount > DUST)
    .map((b) => ({
      key: `collateral-factor-${b.symbol}`,
      label: fillText(MOONWELL_WORDS.sheet_collateral_factor, { symbol: b.symbol }),
      tip: fillText(MOONWELL_WORDS.tip_collateral_factor, { symbol: b.symbol }),
      value: unread,
    }));
  return {
    sides,
    panels: [
      { panel: "risk", rows: risk },
      { panel: "limits", rows: limits, breakdown: params },
    ],
  };
}
