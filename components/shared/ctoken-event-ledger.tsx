"use client";

// A Compound V2-family event card's account cells (anatomy T2.1; rails-ops
// reference/lifetime-flows-scrubber.md, "Compound V2"): Collateral and Debt,
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

import { createContext, useContext } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { DeltaToggle, StateTransition, changeTone } from "@/components/shared/state-transition";
import { usdShown } from "@/lib/shared/usd-display";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { LEDGER_PENDING } from "@/components/shared/event-ledger-context";
import {
  AssetLedgers,
  ClosedTokens,
  ClosedUsd,
  DayCloseNote,
  EventLedgerContext,
  LedgerCell,
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

/** The ledger's decimals for a side holding one asset, so the closed figures
 *  stand as the opened ledger prints them. */
function sumFor(
  side: FlowSide,
  eventId: string,
  state: CTokenEventState,
  focus: ReturnType<typeof useFlowFocus>,
  cum: ReturnType<typeof useEventCum>,
): AssetSum | null {
  const model = focus?.model;
  if (!model || !cum || !focus) return null;
  return eventAssetSum(model, focus.events, side, cum, eventId, state.balances[side], SUM_OPTS);
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

/** One side's closed figures: one asset's tokens before → after (and its
 *  dollars where shown), or several assets' dollars before → after. */
function ClosedSide({
  side,
  state,
  eventTs,
  decimals,
  brand,
  receipt,
  words,
}: {
  side: FlowSide;
  state: CTokenEventState;
  eventTs: number;
  decimals: number | null;
  brand: string;
  receipt?: string;
  words?: CTokenLedgerData["words"];
}) {
  const at = atWords(eventTs);
  const assets = state.balances[side];
  const moved = state.moved[side];
  const held = state.held[side];
  const before = state.heldBefore[side];
  if (assets.length === 0) return <span className={`text-sm font-semibold ${changeTone(false)}`}>None</span>;
  const usdText = (v: number) => (v < 0.005 ? "$0" : fmtPositionUsd(v));
  if (assets.length === 1) {
    const a = assets[0];
    const fmt = (v: number) => (decimals != null && v < 1e6 ? fmtTokens(v, decimals) : fmtPositionAmount(v));
    const changed = moved && fmt(a.before) !== fmt(a.amount);
    const usd = a.price != null ? a.amount * a.price : null;
    const usdOn = usd != null && usdShown(usd);
    return (
      <StateTransition>
        <ClosedTokens>
          {changed && (
            <DeltaToggle
              size="sm"
              before={<Prov info={tokenProv(side, a.symbol, at, true, receipt, words)}>{fmt(a.before)}</Prov>}
              delta={
                <Prov
                  info={{
                    kind: "chain-derived",
                    summary: `${a.symbol} ${side === "collateral" ? "supply" : "debt"} change at ${at} — the balance after the transaction less the balance before it.`,
                    formula: "after − before",
                  }}
                >
                  {`${a.amount >= a.before ? "+" : "−"}${fmt(Math.abs(a.amount - a.before))}`}
                </Prov>
              }
            />
          )}
          <Prov
            info={tokenProv(side, a.symbol, at, false, receipt, words)}
            icon={<TokenChipIcon symbol={a.symbol} size={16} />}
          >
            <span className={`text-sm font-semibold tabular-nums ${changeTone(moved)}`}>{fmt(a.amount)}</span>
          </Prov>
        </ClosedTokens>
        {usdOn && held != null && (
          <ClosedUsd
            before={
              changed && before != null ? (
                <Prov info={heldProv(side, at, brand, true, receipt, words)}>{usdText(before)}</Prov>
              ) : null
            }
            after={<Prov info={heldProv(side, at, brand, false, receipt, words)}>{usdText(held)}</Prov>}
          />
        )}
      </StateTransition>
    );
  }
  return (
    <StateTransition>
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <InlineAssetCluster symbols={assets.map((a) => a.symbol)} size={18} overlap={5} />
        {held == null ? (
          <span className={`text-sm font-semibold ${changeTone(moved)}`}>
            {assets.length.toLocaleString("en-US")} markets
          </span>
        ) : (
          <>
            {moved && before != null && Math.round(before) !== Math.round(held) && (
              <DeltaToggle
                size="sm"
                before={<Prov info={heldProv(side, at, brand, true, receipt, words)}>{usdText(before)}</Prov>}
                delta={null}
              />
            )}
            <Prov info={heldProv(side, at, brand, false, receipt, words)}>
              <span className={`text-sm font-semibold tabular-nums ${changeTone(moved)}`}>{usdText(held)}</span>
            </Prov>
          </>
        )}
      </span>
    </StateTransition>
  );
}

/** The card's Collateral and Debt cells, for the head of its T2 grid. Nothing
 *  on a page that does not tie its timeline to the Lifetime flows panel. */
export function CTokenLedgerCells({ eventId, eventTs }: { eventId: string; eventTs: number }) {
  const focus = useFlowFocus();
  const data = useContext(CTokenLedgerContext);
  const cum = useEventCum(eventId);
  if (!focus || !data) return null;
  const state = data.states?.get(eventId) ?? null;
  // The flows model has not landed: the cells stand as placeholder rows.
  if (!focus.model || !state)
    return (
      <EventLedgerContext.Provider value={LEDGER_PENDING}>
        {(["collateral", "debt"] as const).map((side) => (
          <LedgerCell key={side} label={SIDE_NAME[side]} side={side}>
            {null}
          </LedgerCell>
        ))}
      </EventLedgerContext.Provider>
    );
  const sides = (["collateral", "debt"] as const).filter(
    (s) => s === "collateral" || focus.model!.buckets.some((b) => b.side === "debt"),
  );
  return (
    <>
      {sides.map((side) => {
        const sum = sumFor(side, eventId, state, focus, cum);
        const single = sum ? assetTokenSum(sum) : null;
        const hasLines = sum != null && sum.lines.length > 0;
        return (
          <LedgerCell
            key={side}
            side={side}
            label={SIDE_NAME[side]}
            ledger={
              sum && hasLines ? (
                <SideLedger side={side} eventId={eventId} eventTs={eventTs} state={state} sum={sum} />
              ) : null
            }
            data={{ "data-ctoken-cell": side, "data-receipt-changed": state.moved[side] ? "true" : "false" }}
          >
            <ClosedSide
              side={side}
              state={state}
              eventTs={eventTs}
              decimals={single?.decimals ?? null}
              brand={data.brand}
              receipt={data.receipt}
              words={data.words}
            />
          </LedgerCell>
        );
      })}
    </>
  );
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
