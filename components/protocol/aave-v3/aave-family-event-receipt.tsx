"use client";

// The Aave family's open event card as a receipt (rails-ops TO-DO-ui-jobs 141,
// 213). Two side cells: the side the event changed states its total before →
// after, the change, and the asset it moved before → after; the other states
// what was held or owed at this event, with its assets. Under them one plain
// row: health factor, LTV, still borrowable (and eMode where the account
// used one).
//
// The card's calculator (ReceiptCalcButton, at the right of the open card's
// (i) row) grows each cell into its side's lifetime sum as of the event: the
// first line unsigned,
// then each inflow, each outflow, the balancing item last, a rule, "=" and
// what is held or owed, its assets under it. The line the event filled is
// highlighted with its running total before → after. The printed lines add to
// the printed total (lib/shared/flow-focus.ts `eventSideSum`, on
// lib/shared/flows-sum.ts), and every figure keeps its receipt. A "Since this
// event" line follows where the position has later events.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Calculator } from "lucide-react";
import { Prov } from "@/components/shared/provenance";
import { useFlowFocus, useFlowFocusState } from "@/components/shared/flow-focus-context";
import { fillStyle } from "@/components/shared/lifetime-flows-tip";
import { fmtPositionAmount, fmtPositionUsd } from "@/components/shared/position-row";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { wholeUsd } from "@/lib/shared/flows-sum";
import type { FlowSegment, FlowSide } from "@/lib/shared/flows-timeline";
import { flowRemainderProv, flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";
import { eventCum, eventSideSum, sinceEvent, type EventCum } from "@/lib/shared/flow-focus";
import { accountTotalProv, heldAtEventProv, sideChangeProv, type V3Coords } from "@/lib/aave-v3/event-provenance";
import { baseToUsd, big, legChange, rawToUsd, type AaveV3PositionState } from "@/lib/aave-v3/position-state";
import { ReserveList, TotalHeadline, reserveSymbol, type TouchedLeg } from "./aave-v3-position-state";

/** One figure of the row under the cells. */
export interface RiskItem {
  key: string;
  label: string;
  body: ReactNode;
}

/** The card's calculator: on, and whether this event has a sum to show. */
export interface ReceiptCalc {
  on: boolean;
  toggle: () => void;
}
export const ReceiptCalcContext = createContext<ReceiptCalc | null>(null);

const HUE: Record<FlowSide, string> = { collateral: "var(--color-blue-500)", debt: "var(--color-green-400)" };
const dayStamp = (tsSec: number) => `${shortDate(tsSec)} ${shortDateYear(tsSec)}`;

/** The event's running totals, where the page's flow model holds its day. */
export function useEventCum(eventId: string | undefined): EventCum | null {
  const focus = useFlowFocus();
  return useMemo(
    () => (focus?.model && eventId ? eventCum(focus.model, focus.events, eventId) : null),
    [focus?.model, focus?.events, eventId],
  );
}

/** The calculator at the right of the open card's (i) row: shown where the
 *  event has a lifetime sum to state. */
export function ReceiptCalcButton() {
  const calc = useContext(ReceiptCalcContext);
  if (!calc) return null;
  return (
    <button
      type="button"
      className={`${CTRL_GHOST} ${calc.on ? "bg-sunken text-foreground ring-1 ring-foreground" : CTRL_OFF} size-11 shrink-0 rounded-lg sm:size-8`}
      aria-pressed={calc.on}
      aria-label="Show how the position adds up"
      title="Show how the position adds up"
      data-receipt-calc=""
      onClick={(e) => {
        e.stopPropagation();
        calc.toggle();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Calculator size={16} aria-hidden />
    </button>
  );
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
                <i aria-hidden className="inline-block size-2.5 rounded-[2px]" style={{ background: HUE[side] }} />
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
      {sum && cum && !cum.exact && (
        <p className="mt-2 text-xs text-rb-500" data-receipt-day-close="">
          The page does not hold every event of {eventTs != null ? dayStamp(eventTs) : "this day"}, so the lines stand
          at the close of that day.
        </p>
      )}
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
  const rows = eventSideSum(model, side, cum, facts.held);
  const at = eventTs != null ? `this event (${dayStamp(eventTs)})` : "this event";
  const lineProv = (l: (typeof rows.lines)[number]) =>
    l.kind === "rest"
      ? flowRemainderProv(l.label, side, at, l.seg.note)
      : flowSegmentProv(l.seg, side, at, false, model.daily);
  const swatch = (seg: FlowSegment | null, kind: string) =>
    kind === "rest" ? (
      <i aria-hidden className="inline-block size-2.5 rounded-[2px] border border-dashed border-rb-500" />
    ) : (
      <i
        aria-hidden
        className="inline-block size-2.5 rounded-[2px]"
        style={seg ? fillStyle(side, seg) : { background: HUE[side] }}
      />
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
  const heldBefore = facts.heldBefore;
  const changed = heldBefore != null && Math.round(heldBefore) !== Math.round(facts.held);
  // The label keeps its room; a wide before → after takes two lines.
  const grid = "grid grid-cols-[12px_12px_minmax(7.5rem,1fr)_auto] items-center gap-x-2 rounded-lg px-1.5 -mx-1.5 py-1";
  const pair = (before: string | null, after: ReactNode) => (
    <span className="flex flex-wrap items-baseline justify-end gap-x-1 text-right">
      {before != null && <span className="whitespace-nowrap font-normal text-rb-500">{before} →</span>}
      <span className="whitespace-nowrap">{after}</span>
    </span>
  );
  const dirOf = (key: string) => model.buckets.find((b) => b.key === key)?.dir;
  return (
    <div className="flex flex-col text-[13px] tabular-nums" data-receipt-sum={side}>
      {rows.lines.map((l) => (
        <div
          key={l.key}
          className={`${grid}${l.hl ? " font-semibold" : ""}`}
          style={
            l.hl
              ? { background: "var(--rb-hl, rgba(127,127,127,0.12))", boxShadow: `inset 0 0 0 1.5px ${HUE[side]}` }
              : undefined
          }
          data-receipt-line={l.kind}
          data-receipt-line-key={l.key}
          data-receipt-dollars={l.dollars}
          {...(l.hl ? { "data-receipt-hl": "" } : {})}
        >
          <span className="text-right text-rb-500">{l.sign}</span>
          {swatch(l.seg, l.kind)}
          <span className="min-w-0">
            {l.label}
            {l.hl && (
              <small className="block text-xs font-normal text-rb-500">
                {hlNote(cum, l.key, dirOf(l.key) === "in" ? "+" : "−")}
              </small>
            )}
          </span>
          {pair(l.hl ? l.before : null, <Prov info={lineProv(l)}>{l.amount}</Prov>)}
        </div>
      ))}
      <div
        className={`${grid} mt-1 rounded-none border-t border-rb-300 pt-1.5 font-semibold dark:border-rb-600`}
        data-receipt-line="total"
        data-receipt-dollars={rows.total.dollars}
      >
        <span className="text-right text-foreground">=</span>
        <i aria-hidden className="inline-block size-2.5 rounded-[2px]" style={{ background: HUE[side] }} />
        <span className="min-w-0">
          {side === "collateral" ? "Held at this event" : "Owed at this event"}
          {changed && heldBefore != null && (
            <small className="block text-xs font-normal text-rb-500">
              {`${facts.held - heldBefore < 0 ? "−" : "+"}${wholeUsd(facts.held - heldBefore)}`}
              {facts.moved.length > 0 && ` (${facts.moved.join(", ")})`}
            </small>
          )}
        </span>
        {pair(
          changed && heldBefore != null ? wholeUsd(heldBefore) : null,
          <Prov info={totalProv}>{rows.total.amount}</Prov>,
        )}
      </div>
    </div>
  );
}

/** The highlighted line's note: what this event put on it. */
function hlNote(cum: EventCum, key: string, sign: string): string {
  const legs = cum.legs.filter((l) => l.bucket === key);
  const usd = `${sign}${wholeUsd(legs.reduce((a, l) => a + (l.usd ?? 0), 0))}`;
  const tokens = legs
    .filter((l) => l.amount != null && l.symbol)
    .map((l) => `${sign}${fmtPositionAmount(l.amount)} ${l.symbol}`);
  return tokens.length > 0 ? `${tokens.join(", ")} (${usd.slice(sign.length)}) at this event` : `${usd} at this event`;
}

/** "Since this event": where the position has later events, what the side
 *  holds or owes at the cursor's date (today where the cursor is not later),
 *  and each line that has moved since. */
function SinceLine({ side, cum, held }: { side: FlowSide; cum: EventCum; held: number | null }) {
  const focus = useFlowFocus();
  const cursor = useFlowFocusState((s) => s.cursor);
  const model = focus?.model;
  if (!model || !cum.later || held == null) return null;
  const startSec = model.start / 1000;
  const cursorStop = cursor && !cursor.live ? Math.floor(cursor.endTs / 86_400) - startSec / 86_400 : null;
  const later = cursorStop != null && cursorStop > cum.stop;
  const stop = later ? (cursorStop as number) : model.liveStop;
  const word = later && cursor ? cursor.word : "today";
  const s = sinceEvent(model, side, cum, stop);
  const isLive = stop >= model.liveStop;
  const when = isLive ? "now" : `the end of ${word}`;
  const heldSeg: FlowSegment = {
    key: `${side}-held`,
    label: side === "collateral" ? "Held" : "Owed",
    fill: "held",
    width: s.held,
    value: s.held,
  };
  return (
    <p className="mt-2 rounded-lg bg-raised px-2 py-1.5 text-xs leading-snug text-foreground" data-receipt-since={side}>
      Since this event: {side === "collateral" ? "held" : "owed"} {wholeUsd(held)} →{" "}
      <Prov info={flowSegmentProv(heldSeg, side, when, isLive, model.daily)}>{wholeUsd(s.held)}</Prov>
      {s.lines.map((l) => {
        const seg: FlowSegment = { key: l.key, label: l.label, fill: "in", width: l.now, value: l.now };
        return (
          <span key={l.key}>
            ; {l.label.toLowerCase()} {wholeUsd(l.at)} →{" "}
            <Prov info={flowSegmentProv(seg, side, when, isLive, model.daily)}>{wholeUsd(l.now)}</Prov>
          </span>
        );
      })}{" "}
      {isLive ? "today" : `at ${word}`}.
    </p>
  );
}
