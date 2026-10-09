"use client";

// A Compound V2-family event card's account cells (anatomy T2.1; rails-ops
// reference/lifetime-flows-scrubber.md, "Compound V2"), the ledger cells at
// the head of the card's `cells` slot (ui-jobs 309): Collateral and Debt,
// each the grid's full width and one row closed, that open into the side's
// ledger as of the end of the event's transaction. With one asset the closed
// cell states its tokens before → after (and its dollars after a thin divider
// where the Display switches show them); with several, the side's dollars
// before → after and the assets' icons. Opened: in the asset's token where the
// side holds one, one short ledger per asset with the side's total in dollars
// where it holds several (lib/shared/flow-focus.ts `eventAssetSum`).
//
// The account at each event comes from the page's replay
// (lib/shared/ctoken-flows.ts `ctokenEventStates`), handed down through
// `CTokenLedgerContext`. Until the flows model lands the cells stand as
// placeholder rows.

import { createContext, useContext, useMemo } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { usdShown } from "@/lib/shared/usd-display";
import type { EventCardLedgers } from "@/components/shared/event-card";
import type { EventLedgerCellSpec } from "@/components/shared/event-cells";
import type { EventPriceChip } from "@/components/shared/event-price-row";
import type { AtBlockPricePill } from "@/components/shared/liquidation-forensics";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { LEDGER_PENDING, type EventLedgerSource } from "@/components/shared/event-ledger-context";
import {
  AssetLedgers,
  usdAt,
  DayCloseNote,
  EventLedgerContext,
  LedgerTable,
  SIDE_NAME,
  dayStamp,
  useEventCum,
} from "@/components/shared/event-ledger";
import { fmtPositionAmount, fmtPositionUsd } from "@/components/shared/position-row";
import { assetTokenSum, eventAssetSum, eventSideSumByAsset, fmtTokens, type AssetSum } from "@/lib/shared/flow-focus";
import { assetLedgers, tokenLedger } from "@/lib/shared/event-ledger";
import type { CTokenEventState } from "@/lib/shared/ctoken-flows";
import type { FlowSide } from "@/lib/shared/flows-timeline";

/** Each event's account, by event id, from the page's replay; the family's
 *  brand for the receipts. */
export interface CTokenLedgerData {
  states: Map<string, CTokenEventState> | null;
  brand: string;
  /** The receipt token's name, "cToken" by default ("mToken" on Moonwell). */
  receipt?: string;
  /** How a family's rows state each side's balance, where it is not a
   *  receipt token's (Dolomite's par × the market's index): `held` for the
   *  side's dollars, `token` for one market's tokens. */
  words?: { held: Record<FlowSide, string>; token: Record<FlowSide, string> };
  /** Each market's USD price at an event's block, keyed "block:market",
   *  where the page read it for the panel (Compound V2): the price row's. */
  pricesAt?: ReadonlyMap<string, number> | null;
}
export const CTokenLedgerContext = createContext<CTokenLedgerData | null>(null);

/** The interest line of a side by asset: what each market's index added since
 *  its last event (the events' own interest is on its bucket). */
const SUM_OPTS = { interestLabel: "Interest since the last event", relDust: 1e-9 };

const atWords = (ts: number) => `this event (${dayStamp(ts)})`;

function heldProv(
  side: FlowSide,
  at: string,
  brand: string,
  before: boolean,
  receipt = "cToken",
  words?: CTokenLedgerData["words"],
): Provenance {
  const what = side === "collateral" ? "held" : "owed";
  return {
    kind: "chain-derived",
    summary: `${side === "collateral" ? "Collateral" : "Debt"} ${before ? "before" : "after"} ${at} — what the account ${what} ${before ? "just before the transaction ran" : "once the transaction had run"}, in USD: each market's ${words ? words.held[side] : side === "collateral" ? `supply (${receipt}s × the exchange rate)` : "debt (accountBorrows)"} as its rows recorded it, a market the transaction left alone grown by its interest since its last event, each at ${brand}'s oracle price of its latest priced event.`,
    formula: "Σ balance × price",
  };
}

function tokenProv(
  side: FlowSide,
  symbol: string,
  at: string,
  before: boolean,
  receipt = "cToken",
  words?: CTokenLedgerData["words"],
): Provenance {
  return {
    kind: "chain-derived",
    summary: `${symbol} ${side === "collateral" ? "supplied" : "owed"} ${before ? "before" : "after"} ${at} — ${before ? "just before the transaction ran" : "once the transaction had run"}: the market's ${words ? words.token[side] : side === "collateral" ? `supply (the ${receipt} balance × the exchange rate at the block)` : "debt (the emitted accountBorrows, and that less the act before it)"} as the row states it.`,
  };
}

/** The opened cell: the side's ledger as of the event. */
function SideLedger({
  side,
  eventId,
  eventTs,
  state,
  sum,
}: {
  side: FlowSide;
  eventId: string;
  eventTs: number;
  state: CTokenEventState;
  sum: AssetSum;
}) {
  const focus = useFlowFocus();
  const cum = useEventCum(eventId);
  const ctx = useContext(CTokenLedgerContext);
  const brand = ctx?.brand ?? "the protocol";
  const receipt = ctx?.receipt;
  const words = ctx?.words;
  const model = focus?.model;
  if (!model || !cum || !focus) return null;
  const held = state.held[side];
  const at = atWords(eventTs);
  const ev = focus.events.find((e) => e.id === eventId) ?? null;
  const name = SIDE_NAME[side];
  const note = <DayCloseNote cum={cum} eventTs={eventTs} />;
  if (held == null)
    return (
      <p className="text-sm text-rb-500" data-ledger-missing={side}>
        A market here has no oracle price, so the ledger is left out.
      </p>
    );
  const shownFor = (sym: string) => {
    const b = sum.balances.find((x) => x.symbol === sym);
    return usdShown(b?.price != null ? b.amount * b.price : null);
  };
  const totalProv = heldProv(side, at, brand, false, receipt, words);
  const totalBeforeProv = heldProv(side, at, brand, true, receipt, words);
  const single = assetTokenSum(sum);
  if (single) {
    const dollars = eventSideSumByAsset(model, sum, cum, held);
    const ledger = tokenLedger({
      model,
      side,
      ev,
      sum: single,
      usd: shownFor(single.symbol)
        ? { lines: dollars.lines, dollars: dollars.total.dollars, before: state.heldBefore[side] }
        : null,
      price: sum.balances.find((x) => x.symbol === single.symbol)?.price ?? null,
    });
    return (
      <>
        <LedgerTable
          ledger={ledger}
          name={name}
          at={at}
          totalUsdProv={totalProv}
          totalUsdBeforeProv={totalBeforeProv}
          daily={model.daily}
        />
        {note}
      </>
    );
  }
  const { assets, usd } = assetLedgers({ model, side, ev, sum, held, heldBefore: state.heldBefore[side] });
  return (
    <>
      <AssetLedgers
        side={side}
        assets={assets}
        usd={usd}
        at={at}
        totalUsdProv={totalProv}
        totalUsdBeforeProv={totalBeforeProv}
        usdShownFor={(l) => l.usd != null && l.symbol != null && shownFor(l.symbol)}
      />
      {note}
    </>
  );
}

/** One side's closed figures as a ledger cell: one asset's tokens before →
 *  after (and its dollars where shown), or several assets' dollars before →
 *  after behind their icons. */
function sideCell(
  side: FlowSide,
  state: CTokenEventState,
  eventTs: number,
  decimals: number | null,
  data: CTokenLedgerData,
): EventLedgerCellSpec {
  const { brand, receipt, words } = data;
  const at = atWords(eventTs);
  const assets = state.balances[side];
  const moved = state.moved[side];
  const held = state.held[side];
  const before = state.heldBefore[side];
  const base = { kind: "ledger" as const, side, key: side, label: SIDE_NAME[side], changed: moved };
  if (assets.length === 0) return { ...base, value: { none: "None" } };
  const usdText = (v: number) => (v < 0.005 ? "$0" : fmtPositionUsd(v));
  if (assets.length === 1) {
    const a = assets[0];
    const fmt = (v: number) => (decimals != null && v < 1e6 ? fmtTokens(v, decimals) : fmtPositionAmount(v));
    const changed = moved && fmt(a.before) !== fmt(a.amount);
    const usd = a.price != null ? a.amount * a.price : null;
    const usdOn = usd != null && usdShown(usd);
    return {
      ...base,
      value: {
        before: changed
          ? { text: fmt(a.before), info: tokenProv(side, a.symbol, at, true, receipt, words) }
          : undefined,
        delta: changed
          ? {
              text: `${a.amount >= a.before ? "+" : "−"}${fmt(Math.abs(a.amount - a.before))}`,
              info: {
                kind: "chain-derived",
                summary: `${a.symbol} ${side === "collateral" ? "supply" : "debt"} change at ${at} — the balance after the transaction less the balance before it.`,
                formula: "after − before",
              },
            }
          : undefined,
        after: { text: fmt(a.amount), info: tokenProv(side, a.symbol, at, false, receipt, words) },
        icon: a.symbol,
      },
      usd:
        usdOn && held != null
          ? {
              before:
                changed && before != null ? (
                  <Prov info={heldProv(side, at, brand, true, receipt, words)}>{usdText(before)}</Prov>
                ) : null,
              after: <Prov info={heldProv(side, at, brand, false, receipt, words)}>{usdText(held)}</Prov>,
              ...usdAt({ price: a.price, symbol: a.symbol, before: a.before, after: a.amount }),
            }
          : undefined,
    };
  }
  return {
    ...base,
    value: {
      cluster: assets.map((a) => a.symbol),
      ...(held == null
        ? { after: { text: `${assets.length.toLocaleString("en-US")} markets` } }
        : {
            before:
              moved && before != null && Math.round(before) !== Math.round(held)
                ? { text: usdText(before), info: heldProv(side, at, brand, true, receipt, words) }
                : undefined,
            after: { text: usdText(held), info: heldProv(side, at, brand, false, receipt, words) },
          }),
    },
  };
}

/** The card's Collateral and Debt ledger cells, for the head of its `cells`
 *  slot, and the ledgers they open into. None on a page that does not tie its
 *  timeline to the Lifetime flows panel; placeholder rows until the flows
 *  model lands. */
export function useCTokenLedgerCells(
  eventId: string,
  eventTs: number,
): { cells: EventLedgerCellSpec[]; ledgers: EventCardLedgers } {
  const focus = useFlowFocus();
  const data = useContext(CTokenLedgerContext);
  const cum = useEventCum(eventId);
  const model = focus?.model ?? null;
  const state = model ? (data?.states?.get(eventId) ?? null) : null;
  const sums = useMemo(() => {
    if (!model || !state || !cum || !focus) return null;
    const of = (side: FlowSide) =>
      eventAssetSum(model, focus.events, side, cum, eventId, state.balances[side], SUM_OPTS);
    return { collateral: of("collateral"), debt: of("debt") };
  }, [model, state, cum, focus, eventId]);
  const ready = model != null && state != null;
  const src = useMemo<EventLedgerSource>(
    () =>
      ready && sums
        ? {
            has: (side) => (sums[side]?.lines.length ?? 0) > 0,
            render: (side) => {
              const sum = sums[side];
              return sum ? (
                <SideLedger side={side} eventId={eventId} eventTs={eventTs} state={state} sum={sum} />
              ) : null;
            },
          }
        : LEDGER_PENDING,
    [ready, sums, eventId, eventTs, state],
  );
  if (!focus || !data)
    return { cells: [], ledgers: { none: "The page does not tie its timeline to the Lifetime flows panel." } };
  const ledgers: EventCardLedgers = {
    provider: (children) => <EventLedgerContext.Provider value={src}>{children}</EventLedgerContext.Provider>,
  };
  // The flows model has not landed: the cells stand as placeholder rows.
  if (!ready)
    return {
      cells: (["collateral", "debt"] as const).map((side) => ({
        kind: "ledger" as const,
        side,
        key: side,
        label: SIDE_NAME[side],
        changed: true,
        value: {},
      })),
      ledgers,
    };
  const sides = (["collateral", "debt"] as const).filter(
    (s) => s === "collateral" || model.buckets.some((b) => b.side === "debt"),
  );
  return {
    cells: sides.map((side) => {
      const sum = sums?.[side] ?? null;
      const single = sum ? assetTokenSum(sum) : null;
      return sideCell(side, state, eventTs, single?.decimals ?? null, data);
    }),
    ledgers,
  };
}

/** The market's USD price at the event's block, where the page read it for
 *  its Lifetime flows panel (`CTokenLedgerData.pricesAt`). */
export function useCTokenPriceAt(block: number | undefined, market: string): number | null {
  const p = useContext(CTokenLedgerContext)?.pricesAt?.get(`${block}:${market}`);
  return block != null && p != null && p > 0 ? p : null;
}

/** At-block price pills as the price row's chips: the receipt and the
 *  figure's precision kept, the oracle and its block in the tip. */
export function pillPriceChips(
  pills: AtBlockPricePill[],
  brand: string,
  display?: (n: number) => string,
): EventPriceChip[] {
  return pills.map((p) => ({
    symbol: p.symbol,
    usd: p.priceUsd,
    address: p.address,
    info: p.priceProv,
    display: display ? display(p.priceUsd) : p.display != null ? `$${p.display}` : undefined,
    title: `${p.symbol} price at this event: ${brand}'s ${p.note ?? "oracle at block"}`,
  }));
}

/** Whether a side holds exactly one market at the event, that market's
 *  symbol: the card's per-market balance cell would repeat the account cell. */
export function useCTokenSoleAsset(eventId: string, side: FlowSide): string | null {
  const data = useContext(CTokenLedgerContext);
  const focus = useFlowFocus();
  const state = focus?.model ? data?.states?.get(eventId) : undefined;
  if (!state) return null;
  const assets = state.balances[side];
  return assets.length === 1 ? assets[0].symbol : null;
}
