"use client";

// An event card's lifetime sum, on a page that ties its timeline to the
// Lifetime flows panel (flow-focus-context.tsx; rails-ops
// reference/lifetime-flows-scrubber.md, "The event card's sum"). The card's
// calculator (ReceiptCalcButton, at the right of the open card's (i) row)
// grows each side into its lifetime sum as of the event: the first line
// unsigned, then each inflow, each outflow, the balancing item last, a rule,
// "=" and what is held or owed. The line the event filled is highlighted with
// its running total before → after. The printed lines add to the printed
// total (lib/shared/flow-focus.ts `eventSideSum`, on lib/shared/flows-sum.ts),
// and every figure keeps its receipt. A "Since this event" line follows where
// the position has later events.
//
// The Aave family's receipt (components/protocol/aave-v3/aave-family-event-receipt.tsx)
// and the Liquity family's (components/protocol/liquity-family/liquity-event-sum.tsx)
// draw their cells around these.

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Calculator } from "lucide-react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { useFlowFocus, useFlowFocusState } from "@/components/shared/flow-focus-context";
import { fillStyle } from "@/components/shared/lifetime-flows-tip";
import { fmtPositionAmount } from "@/components/shared/position-row";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { wholeUsd } from "@/lib/shared/flows-sum";
import type { FlowModel, FlowSegment, FlowSide } from "@/lib/shared/flows-timeline";
import { flowRemainderProv, flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";
import { eventCum, eventSideSum, sinceEvent, type EventCum } from "@/lib/shared/flow-focus";

/** The card's calculator: on, and its switch. */
export interface ReceiptCalc {
  on: boolean;
  toggle: () => void;
}
export const ReceiptCalcContext = createContext<ReceiptCalc | null>(null);

/** Each side's hue, as the bars draw it. */
export const SIDE_HUE: Record<FlowSide, string> = {
  collateral: "var(--color-blue-500)",
  debt: "var(--color-green-400)",
};
export const dayStamp = (tsSec: number) => `${shortDate(tsSec)} ${shortDateYear(tsSec)}`;

/** The event's running totals, where the page's flow model holds its day. */
export function useEventCum(eventId: string | undefined): EventCum | null {
  const focus = useFlowFocus();
  return useMemo(
    () => (focus?.model && eventId ? eventCum(focus.model, focus.events, eventId) : null),
    [focus?.model, focus?.events, eventId],
  );
}

/** A card's calculator state, and whether the event has a sum to show. */
export function useReceiptCalc(eventId: string): { calc: ReceiptCalc; hasSum: boolean } {
  const [on, setOn] = useState(false);
  const calc = useMemo(() => ({ on, toggle: () => setOn((v) => !v) }), [on]);
  return { calc, hasSum: useEventCum(eventId) != null };
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

/** One side's sum as of the event, landing on `held` (the card's figure).
 *  `heldBefore` and `moved` state the total's move at this event under its
 *  label where it moved. */
export function EventSumLines({
  side,
  model,
  cum,
  held,
  heldBefore,
  moved,
  totalLabel,
  totalProv,
  eventTs,
  at: atWords,
}: {
  side: FlowSide;
  model: FlowModel;
  cum: EventCum;
  held: number;
  heldBefore: number | null;
  /** The token moves at this event ("+200 USDC"). */
  moved: string[];
  totalLabel: string;
  totalProv: Provenance;
  eventTs?: number;
  /** The receipts' words for the sum's date, where it is not an event's
   *  ("the close of 15 Jun '25"). */
  at?: string;
}) {
  const rows = eventSideSum(model, side, cum, held);
  const at = atWords ?? (eventTs != null ? `this event (${dayStamp(eventTs)})` : "this event");
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
        style={seg ? fillStyle(side, seg) : { background: SIDE_HUE[side] }}
      />
    );
  const changed = heldBefore != null && Math.round(heldBefore) !== Math.round(held);
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
              ? { background: "var(--rb-hl, rgba(127,127,127,0.12))", boxShadow: `inset 0 0 0 1.5px ${SIDE_HUE[side]}` }
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
        <i aria-hidden className="inline-block size-2.5 rounded-[2px]" style={{ background: SIDE_HUE[side] }} />
        <span className="min-w-0">
          {totalLabel}
          {changed && heldBefore != null && (
            <small className="block text-xs font-normal text-rb-500">
              {`${held - heldBefore < 0 ? "−" : "+"}${wholeUsd(held - heldBefore)}`}
              {moved.length > 0 && ` (${moved.join(", ")})`}
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
export function SinceLine({ side, cum, held }: { side: FlowSide; cum: EventCum; held: number | null }) {
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

/** Where the page does not hold every event of the day, the lines stand at
 *  the day's close. */
export function DayCloseNote({ cum, eventTs }: { cum: EventCum; eventTs?: number }) {
  if (cum.exact) return null;
  return (
    <p className="mt-2 text-xs text-rb-500" data-receipt-day-close="">
      The page does not hold every event of {eventTs != null ? dayStamp(eventTs) : "this day"}, so the lines stand at
      the close of that day.
    </p>
  );
}
