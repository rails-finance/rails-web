"use client";

// A Liquity-family Trove event's lifetime sum (rails-ops
// reference/lifetime-flows-scrubber.md, "The event card's sum"): the open
// card's calculator shows it in place of the card's grid, a Collateral and a
// Debt cell, each the side's lines as of the end of the event's transaction
// in the side's token (the collateral token, the stablecoin), landing on what
// the Trove held or owed then. USD shows beside each figure by the timeline's
// Display switches ("USD for other tokens" for the collateral, "USD for
// stablecoins" for the debt); with it the collateral's USD column adds
// Market move, the price's effect, which has no token amount. The pieces are
// components/shared/flow-event-sum.tsx; the figures come from the Trove's
// replay (lib/shared/liquity-flows.ts `liquityFocusEvents`).

import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { DayCloseNote, EventTokenSumLines, SIDE_HUE, dayStamp, useEventCum } from "@/components/shared/flow-event-sum";
import { useUsdShown } from "@/components/shared/timeline-display-context";
import { eventTokenSum } from "@/lib/shared/flow-focus";
import type { FlowSegment } from "@/lib/shared/flows-timeline";
import { flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";

export function LiquityEventSum({ eventId, eventTs }: { eventId: string; eventTs: number }) {
  const focus = useFlowFocus();
  const cum = useEventCum(eventId);
  const usdShown = useUsdShown();
  const model = focus?.model;
  const sides = focus?.events.find((e) => e.id === eventId)?.sides;
  if (!model || !cum || !sides || !focus) return null;
  const at = `this event (${dayStamp(eventTs)})`;
  return (
    <div className="px-5 py-2" data-liquity-event-sum="">
      <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-cols-2" data-receipt="sum">
        {(["collateral", "debt"] as const).map((side) => {
          const f = sides[side];
          const sum = eventTokenSum(model, focus.events, side, cum, eventId);
          if (!sum) return null;
          const word = side === "collateral" ? "Collateral" : "Debt";
          // The debt at its $1 face: its USD is its token amount.
          const usd = usdShown(f.symbol, side === "debt" ? f.held : f.after, f.held);
          const held: FlowSegment = {
            key: `${side}-held`,
            label: side === "collateral" ? "Held" : "Owed",
            fill: "held",
            width: f.after,
            value: f.after,
          };
          return (
            <div
              key={side}
              className="flex min-w-0 flex-col rounded-xl bg-background px-4 py-3"
              data-receipt-cell={side}
            >
              <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-foreground">
                <i aria-hidden className="inline-block size-2.5 rounded-[2px]" style={{ background: SIDE_HUE[side] }} />
                {word}
                <span className="font-normal text-rb-500">in {sum.symbol}</span>
              </div>
              <EventTokenSumLines
                side={side}
                model={model}
                cum={cum}
                sum={sum}
                usd={usd}
                held={f.after}
                heldBefore={f.before}
                totalLabel={side === "collateral" ? "Held at this event" : "Owed at this event"}
                totalProv={flowSegmentProv(held, side, at, false, model.daily)}
                eventTs={eventTs}
              />
            </div>
          );
        })}
      </div>
      <DayCloseNote cum={cum} eventTs={eventTs} />
    </div>
  );
}
