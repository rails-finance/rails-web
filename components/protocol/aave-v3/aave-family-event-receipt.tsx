"use client";

// The Aave family's open event card as a receipt (rails-ops TO-DO-ui-jobs 141,
// 213). Two side cells: the side the event changed states its total before →
// after, the change, and the asset it moved before → after; the other states
// what was held or owed at this event, with its assets. Under them one plain
// row: health factor, LTV, still borrowable (and eMode where the account
// used one).
//
// The card's calculator (components/shared/flow-event-sum.tsx) grows each
// cell into its side's lifetime sum as of the event, its assets under it.

import { useContext, type ReactNode } from "react";
import {
  DayCloseNote,
  EventSumLines,
  ReceiptCalcContext,
  SIDE_HUE,
  SinceLine,
  useEventCum,
} from "@/components/shared/flow-event-sum";
import { Prov } from "@/components/shared/provenance";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { fmtPositionAmount, fmtPositionUsd } from "@/components/shared/position-row";
import type { FlowSide } from "@/lib/shared/flows-timeline";
import type { EventCum } from "@/lib/shared/flow-focus";
import { accountTotalProv, heldAtEventProv, sideChangeProv, type V3Coords } from "@/lib/aave-v3/event-provenance";
import { baseToUsd, big, legChange, rawToUsd, type AaveV3PositionState } from "@/lib/aave-v3/position-state";
import { ReserveList, TotalHeadline, reserveSymbol, type TouchedLeg } from "./aave-v3-position-state";

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
  /** The timeline event this card states, for its lifetime sum. */
  eventId?: string;
  eventTs?: number;
  risk: RiskItem[];
  /** Lines under the row (a liquidation's basis, a missing read). */
  notes?: ReactNode;
}) {
  const calc = useContext(ReceiptCalcContext);
  const cum = useEventCum(eventId);
  const sum = !!calc?.on && cum != null;
  const touchedOn = (side: "supply" | "debt") => new Set(touched.filter((t) => t.side === side).map((t) => t.reserve));
  return (
    <div className="px-5 py-2" data-position-state="ready" data-position-complete={state.complete ? "true" : "false"}>
      <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-cols-2" data-receipt={sum ? "sum" : "open"}>
        {(["collateral", "debt"] as const).map((side) => {
          const f = sideFacts(state, side, touched);
          return (
            <div
              key={side}
              className="flex min-w-0 flex-col rounded-xl bg-background px-4 py-3"
              data-position-card={side}
              data-receipt-cell={side}
              data-receipt-changed={f.changed || f.touchedHere ? "true" : "false"}
            >
              <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-foreground">
                <i aria-hidden className="inline-block size-2.5 rounded-[2px]" style={{ background: SIDE_HUE[side] }} />
                {side === "collateral" ? "Collateral" : "Debt"}
              </div>
              {sum && cum ? (
                <SideSum side={side} state={state} coords={coords} cum={cum} facts={f} eventTs={eventTs} />
              ) : (
                <SideCell side={side} state={state} coords={coords} facts={f} />
              )}
              <ReserveList
                state={state}
                side={f.leg as "supply" | "debt"}
                coords={coords}
                touched={touchedOn(f.leg as "supply" | "debt")}
              />
              {side === "collateral" && state.sources.settings == null && (
                <div className="mt-1 text-xs text-rb-500">Collateral on/off isn&rsquo;t available at this block.</div>
              )}
              {sum && cum && <SinceLine side={side} cum={cum} held={f.held} />}
            </div>
          );
        })}
      </div>
      {sum && cum && <DayCloseNote cum={cum} eventTs={eventTs} />}
      <div
        className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] sm:gap-4 sm:px-4"
        data-receipt-risk=""
      >
        {risk.map((r) => (
          <div key={r.key} className="min-w-0" data-position-card={r.key}>
            <div className="text-xs text-rb-500">{r.label}</div>
            <div className="mt-0.5">{r.body}</div>
          </div>
        ))}
      </div>
      {notes && <div className="mt-2 space-y-0.5 text-xs text-rb-500">{notes}</div>}
    </div>
  );
}

/** The open cell: the side's total at the event, before → after where it
 *  moved, and the change with the asset it moved. */
function SideCell({
  side,
  state,
  coords,
  facts,
}: {
  side: FlowSide;
  state: AaveV3PositionState;
  coords: V3Coords;
  facts: ReturnType<typeof sideFacts>;
}) {
  const what = side === "collateral" ? "collateral" : "debt";
  const label =
    side === "debt" ? "Owed at this event" : facts.offSupply ? "Collateral at this event" : "Held at this event";
  const diff = facts.before != null && facts.after != null ? facts.after - facts.before : 0;
  return (
    <div data-receipt-total={side}>
      <div className="text-xs text-rb-500">{label}</div>
      <div className="mt-0.5 text-lg">
        <TotalHeadline state={state} what={what} coords={coords} />
      </div>
      {facts.changed && facts.before != null && facts.after != null && (
        <div className="text-xs tabular-nums text-rb-500" data-receipt-change={side}>
          <Prov info={sideChangeProv(what, coords, { before: facts.before, after: facts.after })}>
            {`${diff < 0 ? "−" : "+"}${fmtPositionUsd(Math.abs(diff))}`}
          </Prov>
          {facts.moved.length > 0 && ` (${facts.moved.join(", ")})`}
        </div>
      )}
    </div>
  );
}

/** The cell as the side's sum at the event. */
function SideSum({
  side,
  state,
  coords,
  cum,
  facts,
  eventTs,
}: {
  side: FlowSide;
  state: AaveV3PositionState;
  coords: V3Coords;
  cum: EventCum;
  facts: ReturnType<typeof sideFacts>;
  eventTs?: number;
}) {
  const focus = useFlowFocus();
  const model = focus?.model;
  if (!model) return null;
  if (facts.held == null)
    return (
      <p className="text-xs text-rb-500" data-receipt-sum-missing={side}>
        A supplied reserve has no price at this block, so the sum is left out.
      </p>
    );
  const what = side === "collateral" ? "collateral" : "debt";
  const totalProv =
    side === "collateral" && facts.offSupply
      ? heldAtEventProv(coords, { parts: facts.parts, total: facts.held })
      : accountTotalProv(what, "after", coords, {
          base:
            side === "collateral"
              ? (state.account?.after.totalCollateralBase ?? "0")
              : (state.account?.after.totalDebtBase ?? "0"),
          poolRevision: state.sources.poolRevision,
        });
  return (
    <EventSumLines
      side={side}
      model={model}
      cum={cum}
      held={facts.held}
      heldBefore={facts.heldBefore}
      moved={facts.moved}
      totalLabel={side === "collateral" ? "Held at this event" : "Owed at this event"}
      totalProv={totalProv}
      eventTs={eventTs}
    />
  );
}
