"use client";

// A Liquity-family Trove event's lifetime sum (rails-ops
// reference/lifetime-flows-scrubber.md, "The event card's sum"): the open
// card's calculator shows it in place of the card's grid, a Collateral and a
// Debt cell, each the side's lines as of the end of the event's transaction
// landing on what the Trove held or owed then (the replay's recorded balance,
// the collateral at the event's price, the debt at its $1 face). The pieces
// are the Aave family's (components/shared/flow-event-sum.tsx); the figures
// come from the Trove's replay (lib/shared/liquity-flows.ts `liquityFocusEvents`).

import { useFlowFocus } from "@/components/shared/flow-focus-context";
import {
  DayCloseNote,
  EventSumLines,
  SIDE_HUE,
  SinceLine,
  dayStamp,
  useEventCum,
} from "@/components/shared/flow-event-sum";
import { fmtPositionAmount } from "@/components/shared/position-row";
import type { FlowSegment } from "@/lib/shared/flows-timeline";
import { flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";

export function LiquityEventSum({ eventId, eventTs }: { eventId: string; eventTs: number }) {
  const focus = useFlowFocus();
  const cum = useEventCum(eventId);
  const model = focus?.model;
  const sides = focus?.events.find((e) => e.id === eventId)?.sides;
  if (!model || !cum || !sides) return null;
  const at = `this event (${dayStamp(eventTs)})`;
  return (
    <div className="px-5 py-2" data-liquity-event-sum="">
      <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-cols-2" data-receipt="sum">
        {(["collateral", "debt"] as const).map((side) => {
          const f = sides[side];
          const word = side === "collateral" ? "Collateral" : "Debt";
          const held: FlowSegment = {
            key: `${side}-held`,
            label: side === "collateral" ? "Held" : "Owed",
            fill: "held",
            width: f.after,
            value: f.after,
          };
          const moved =
            Math.abs(f.amount) > 1e-9
              ? [`${f.amount < 0 ? "−" : "+"}${fmtPositionAmount(Math.abs(f.amount))} ${f.symbol}`]
              : [];
          return (
            <div
              key={side}
              className="flex min-w-0 flex-col rounded-xl bg-background px-4 py-3"
              data-receipt-cell={side}
            >
              <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-foreground">
                <i aria-hidden className="inline-block size-2.5 rounded-[2px]" style={{ background: SIDE_HUE[side] }} />
                {word}
              </div>
              <EventSumLines
                side={side}
                model={model}
                cum={cum}
                held={f.after}
                heldBefore={f.before}
                moved={moved}
                totalLabel={side === "collateral" ? "Held at this event" : "Owed at this event"}
                totalProv={flowSegmentProv(held, side, at, false, model.daily)}
                eventTs={eventTs}
              />
              <SinceLine side={side} cum={cum} held={f.after} />
            </div>
          );
        })}
      </div>
      <DayCloseNote cum={cum} eventTs={eventTs} />
    </div>
  );
}
