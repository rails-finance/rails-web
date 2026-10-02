"use client";

// The Aave family's open event card as a receipt (rails-ops TO-DO-ui-jobs 141,
// 213). Two side cells, each the grid's full width and one row closed: with
// one asset its tokens before → after (and its dollars after a thin divider
// where the Display switches show them), with several the side's dollars
// before → after and the assets' icons (aave-v3-position-state.tsx
// `ClosedSide`). Under them one plain row: health factor, LTV, still
// borrowable (and eMode where the account used one).
//
// Each cell's toggle opens it into its side's ledger as of the event
// (components/shared/event-ledger.tsx): in the asset's token where the side
// holds one, one short ledger per asset with the side's total in dollars
// where it holds several (lib/shared/flow-focus.ts `eventAssetSum`), in
// dollars where the page does not hold every flow before the event.

import type { ReactNode } from "react";
import { EventLedgerContext, ROW_CELLS } from "@/components/shared/event-ledger-context";
import { StatCard } from "@/components/shared/state-transition";
import {
  AssetLedgers,
  DayCloseNote,
  LedgerCell,
  LedgerTable,
  SIDE_NAME,
  dayStamp,
  useEventCum,
} from "@/components/shared/event-ledger";
import { useUsdShown } from "@/components/shared/timeline-display-context";
import type { Provenance } from "@/components/shared/provenance";
import { formatUsdValue } from "@/lib/utils/format";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { fmtPositionAmount, fmtPositionUsd } from "@/components/shared/position-row";
import type { FlowSide } from "@/lib/shared/flows-timeline";
import {
  assetTokenSum,
  eventAssetSum,
  eventSideSum,
  eventSideSumByAsset,
  type AssetBalance,
  type EventCum,
} from "@/lib/shared/flow-focus";
import { assetLedgers, dollarLedger, tokenLedger } from "@/lib/shared/event-ledger";
import { ledgerPartProv } from "@/lib/shared/flows-timeline-provenance";
import { accountTotalProv, heldAtEventProv, sideChangeProv, type V3Coords } from "@/lib/aave-v3/event-provenance";
import { baseToUsd, big, humanOf, legChange, rawToUsd, type AaveV3PositionState } from "@/lib/aave-v3/position-state";
import { ClosedSide, reserveSymbol, type Figure, type TouchedLeg } from "./aave-v3-position-state";

/** One figure of the row under the cells. */
export interface RiskItem {
  key: string;
  label: string;
  body: ReactNode;
}

/** Each side's figures at the event. */
function sideFacts(state: AaveV3PositionState, side: FlowSide, touched: TouchedLeg[]) {
  const acc = state.account;
  const leg = side === "collateral" ? "supply" : "debt";
  const moved = state.reserves.flatMap((r) => {
    if (r.decimals == null) return [];
    const l = side === "collateral" ? r.supply : r.debt;
    const m = legChange(l, r.decimals);
    if (m.sign === 0) return [];
    return [`${m.sign < 0 ? "−" : "+"}${fmtPositionAmount(m.magnitude)} ${reserveSymbol(r)}`];
  });
  const base = (a: NonNullable<typeof acc>["before"]) =>
    side === "collateral" ? a.totalCollateralBase : a.totalDebtBase;
  const before = acc ? baseToUsd(base(acc.before)) : null;
  const after = acc ? baseToUsd(base(acc.after)) : null;
  // A supply with its switch off: the Pool's total leaves it out, the flows
  // count it, so the sum's total adds every supplied balance.
  const offSupply =
    side === "collateral" &&
    state.reserves.some((r) => r.collateral?.after === false && big(r.supply.after) > BigInt(0));
  const parts: { symbol: string; usd: number }[] = [];
  let priced = true;
  if (side === "collateral")
    for (const r of state.reserves) {
      if (big(r.supply.after) <= BigInt(0)) continue;
      if (r.priceBase == null || r.decimals == null) priced = false;
      else parts.push({ symbol: reserveSymbol(r), usd: rawToUsd(r.supply.after, r.priceBase, r.decimals) });
    }
  const held = offSupply ? (priced ? parts.reduce((a, p) => a + p.usd, 0) : null) : after;
  // What every supplied balance was worth before the transaction, where the
  // sum's total adds them.
  let heldBefore: number | null = offSupply ? 0 : before;
  if (offSupply)
    for (const r of state.reserves) {
      if (big(r.supply.before) <= BigInt(0)) continue;
      if (r.priceBase == null || r.decimals == null) heldBefore = null;
      else if (heldBefore != null) heldBefore += rawToUsd(r.supply.before, r.priceBase, r.decimals);
    }
  return {
    leg,
    before,
    after,
    changed: before != null && after != null && Math.round(before * 100) !== Math.round(after * 100),
    touchedHere: touched.some((t) => t.side === leg) || moved.length > 0,
    moved,
    offSupply,
    held,
    heldBefore,
    parts,
  };
}

/** Each asset of a side at the block, in tokens, for the sum by asset. */
function sideBalances(state: AaveV3PositionState, side: FlowSide): AssetBalance[] {
  const out: AssetBalance[] = [];
  for (const r of state.reserves) {
    if (r.decimals == null) continue;
    const l = side === "collateral" ? r.supply : r.debt;
    if (big(l.after) <= BigInt(0) && big(l.before) <= BigInt(0)) continue;
    out.push({
      symbol: reserveSymbol(r),
      amount: Number(humanOf(l.after, r.decimals)),
      before: Number(humanOf(l.before, r.decimals)),
      price: r.priceBase != null ? Number(big(r.priceBase)) / 1e8 : null,
    });
  }
  return out;
}

/** The receipt block of an open Aave-family event card. */
export function AaveFamilyEventReceipt({
  state,
  coords,
  touched,
  eventId,
  eventTs,
  risk,
  notes,
}: {
  state: AaveV3PositionState;
  coords: V3Coords;
  touched: TouchedLeg[];
  /** The timeline event this card states, for its ledgers. */
  eventId?: string;
  eventTs?: number;
  risk: RiskItem[];
  /** Lines under the row (a liquidation's basis, a missing read). */
  notes?: ReactNode;
}) {
  const focus = useFlowFocus();
  const cum = useEventCum(eventId);
  const touchedOn = (side: "supply" | "debt") => new Set(touched.filter((t) => t.side === side).map((t) => t.reserve));
  return (
    <EventLedgerContext.Provider value={ROW_CELLS}>
      <div className="px-5 py-2" data-position-state="ready" data-position-complete={state.complete ? "true" : "false"}>
        <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-flow-row-dense sm:grid-cols-2" data-receipt="open">
          {(["collateral", "debt"] as const).map((side) => {
            const f = sideFacts(state, side, touched);
            const ledger =
              cum && focus?.model ? (
                <SideLedger
                  side={side}
                  state={state}
                  coords={coords}
                  cum={cum}
                  facts={f}
                  eventId={eventId}
                  eventTs={eventTs}
                />
              ) : null;
            return (
              <LedgerCell
                key={side}
                side={side}
                ledger={ledger}
                label={SIDE_NAME[side]}
                data={{
                  "data-position-card": side,
                  "data-receipt-cell": side,
                  "data-receipt-changed": f.changed || f.touchedHere ? "true" : "false",
                }}
              >
                <ClosedSide
                  state={state}
                  side={f.leg as "supply" | "debt"}
                  coords={coords}
                  touched={touchedOn(f.leg as "supply" | "debt")}
                  usd={sideUsd(side, state, coords, f, eventTs)}
                />
                {side === "collateral" && state.sources.settings == null && (
                  <div className="mt-1 text-xs text-rb-500">Collateral on/off isn&rsquo;t available at this block.</div>
                )}
              </LedgerCell>
            );
          })}
          {risk.map((r) => (
            <StatCard key={r.key} label={r.label} data={{ "data-position-card": r.key }}>
              {r.body}
            </StatCard>
          ))}
        </div>
        {notes && <div className="mt-2 space-y-0.5 text-xs text-rb-500">{notes}</div>}
      </div>
    </EventLedgerContext.Provider>
  );
}

/** What the side's ledger closes on in dollars, with its receipts: the
 *  Pool's account total, or where a supply has its collateral switch off,
 *  every supplied balance (the flows count it). */
function sideTotals(
  side: FlowSide,
  state: AaveV3PositionState,
  coords: V3Coords,
  facts: ReturnType<typeof sideFacts>,
  at: string,
): { afterProv: Provenance; beforeProv: Provenance } {
  const what = side === "collateral" ? "collateral" : "debt";
  const name = SIDE_NAME[side];
  const afterProv =
    side === "collateral" && facts.offSupply && facts.held != null
      ? heldAtEventProv(coords, { parts: facts.parts, total: facts.held })
      : accountTotalProv(what, "after", coords, {
          base:
            side === "collateral"
              ? (state.account?.after.totalCollateralBase ?? "0")
              : (state.account?.after.totalDebtBase ?? "0"),
          poolRevision: state.sources.poolRevision,
        });
  const beforeProv =
    facts.offSupply || !state.account
      ? ledgerPartProv(name, "USD", at, "held-before")
      : accountTotalProv(what, "before", coords, {
          base: side === "collateral" ? state.account.before.totalCollateralBase : state.account.before.totalDebtBase,
          poolRevision: state.sources.poolRevision,
        });
  return { afterProv, beforeProv };
}

const atWords = (eventTs?: number) => (eventTs != null ? `this event (${dayStamp(eventTs)})` : "this event");
const usdText = (v: number) => (v < 0.005 ? "$0" : fmtPositionUsd(v));

/** The closed cell's dollars before → after, as its ledger closes on them. */
function sideUsd(
  side: FlowSide,
  state: AaveV3PositionState,
  coords: V3Coords,
  facts: ReturnType<typeof sideFacts>,
  eventTs?: number,
): { before: Figure | null; after: Figure; change: Figure | null } | null {
  const after = facts.offSupply ? facts.held : facts.after;
  const before = facts.offSupply ? facts.heldBefore : facts.before;
  if (after == null) return null;
  const { afterProv, beforeProv } = sideTotals(side, state, coords, facts, atWords(eventTs));
  // The change between the Pool's two totals, behind the arrow's toggle.
  const diff = before != null ? after - before : 0;
  const change =
    !facts.offSupply && facts.changed && before != null
      ? {
          text: `${diff < 0 ? "−" : "+"}${fmtPositionUsd(Math.abs(diff))}`,
          value: `${diff < 0 ? "−" : "+"}${formatUsdValue(Math.abs(diff))}`,
          prov: sideChangeProv(side === "collateral" ? "collateral" : "debt", coords, { before, after }),
        }
      : null;
  return {
    after: { text: usdText(after), value: formatUsdValue(after), prov: afterProv },
    before: before != null ? { text: usdText(before), value: formatUsdValue(before), prov: beforeProv } : null,
    change,
  };
}

/** The opened cell: the side's ledger as of the event. */
function SideLedger({
  side,
  state,
  coords,
  cum,
  facts,
  eventId,
  eventTs,
}: {
  side: FlowSide;
  state: AaveV3PositionState;
  coords: V3Coords;
  cum: EventCum;
  facts: ReturnType<typeof sideFacts>;
  eventId?: string;
  eventTs?: number;
}) {
  const focus = useFlowFocus();
  const usdShown = useUsdShown();
  const model = focus?.model;
  if (!model || !focus) return null;
  if (facts.held == null)
    return (
      <p className="text-sm text-rb-500" data-ledger-missing={side}>
        A supplied reserve has no price at this block, so the ledger is left out.
      </p>
    );
  const at = atWords(eventTs);
  const ev = focus.events.find((e) => e.id === eventId) ?? null;
  const balances = sideBalances(state, side);
  // Where the family books interest as its own lines (Aave V3 on Base and
  // Seamless, lib/aave-v3-base/flows.ts), the balancing line holds only the
  // interest since each reserve's last event, and float dust is no interest.
  const booksInterest = model.buckets.some((b) => b.key === "interestEarned" || b.key === "interestAccrued");
  const bySum = eventId
    ? eventAssetSum(
        model,
        focus.events,
        side,
        cum,
        eventId,
        balances,
        booksInterest ? { interestLabel: "Interest since the last event", relDust: 1e-9 } : {},
      )
    : null;
  const name = SIDE_NAME[side];
  const { afterProv: totalProv, beforeProv: totalBeforeProv } = sideTotals(side, state, coords, facts, at);
  const note = <DayCloseNote cum={cum} eventTs={eventTs} />;
  if (bySum) {
    const priceOf = (sym: string) => bySum.balances.find((x) => x.symbol === sym);
    const shownFor = (sym: string) => {
      const b = priceOf(sym);
      return usdShown(sym, b?.price != null ? b.amount * b.price : null, b?.amount ?? null);
    };
    const single = assetTokenSum(bySum);
    if (single) {
      const dollars = eventSideSumByAsset(model, bySum, cum, facts.held);
      const ledger = tokenLedger({
        model,
        side,
        ev,
        sum: single,
        usd: shownFor(single.symbol)
          ? { lines: dollars.lines, dollars: dollars.total.dollars, before: facts.heldBefore }
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
    const { assets, usd } = assetLedgers({
      model,
      side,
      ev,
      sum: bySum,
      held: facts.held,
      heldBefore: facts.heldBefore,
    });
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
  // The page does not hold every flow before the event: the ledger in dollars.
  const rows = eventSideSum(model, side, cum, facts.held);
  const ledger = dollarLedger({
    model,
    side,
    ev,
    lines: rows.lines,
    dollars: rows.total.dollars,
    before: facts.heldBefore,
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
