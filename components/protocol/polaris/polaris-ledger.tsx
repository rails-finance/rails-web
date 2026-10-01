"use client";

// A Polaris event's ledgers (rails-ops reference/lifetime-flows-scrubber.md,
// "Polaris"; "The event card's sum"): the card's Collateral and Debt cells
// each open into the side's flows as of the end of the event's transaction,
// the collateral in pETH and the debt in the market's stablecoin, landing on
// what the CDP held or owed then. Tokens only: the page states no USD. The
// figures come from the CDP's replay (lib/polaris/flows.ts
// `polarisFocusEvents`); the rows from lib/shared/event-ledger.ts; the cells
// from components/shared/event-ledger.tsx.

import { useMemo, type ReactNode } from "react";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { LEDGER_PENDING } from "@/components/shared/event-ledger-context";
import {
  DayCloseNote,
  EventLedgerContext,
  LedgerTable,
  SIDE_NAME,
  dayStamp,
  useEventCum,
  type EventLedgerSource,
} from "@/components/shared/event-ledger";
import { eventTokenSum } from "@/lib/shared/flow-focus";
import { tokenLedger } from "@/lib/shared/event-ledger";
import type { FlowSegment, FlowSide } from "@/lib/shared/flows-timeline";
import { flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";

function PolarisLedger({ side, eventId, eventTs }: { side: FlowSide; eventId: string; eventTs: number }) {
  const focus = useFlowFocus();
  const cum = useEventCum(eventId);
  const model = focus?.model;
  const ev = focus?.events.find((e) => e.id === eventId) ?? null;
  if (!model || !cum || !ev?.sides || !focus) return null;
  const sum = eventTokenSum(model, focus.events, side, cum, eventId);
  if (!sum) return null;
  const f = ev.sides[side];
  const ledger = tokenLedger({ model, side, ev, sum, usd: null });
  const at = `this event (${dayStamp(eventTs)})`;
  const held: FlowSegment = {
    key: `${side}-held`,
    label: side === "collateral" ? "Held" : "Owed",
    fill: "held",
    width: f.after,
    value: f.after,
  };
  return (
    <>
      <LedgerTable
        ledger={ledger}
        name={SIDE_NAME[side]}
        at={at}
        totalUsdProv={flowSegmentProv(held, side, at, false, model.daily)}
        daily={model.daily}
      />
      <DayCloseNote cum={cum} eventTs={eventTs} />
    </>
  );
}

/** The card's ledgers, where the page ties its timeline to the Lifetime
 *  flows panel. A custody transfer moves nothing and has none. */
export function PolarisLedgerProvider({
  eventId,
  eventTs,
  flowRow,
  children,
}: {
  eventId: string;
  eventTs: number;
  flowRow: boolean;
  children: ReactNode;
}) {
  const focus = useFlowFocus();
  const cum = useEventCum(eventId);
  const has = flowRow && !!focus?.model && cum != null && !!focus.events.find((e) => e.id === eventId)?.sides;
  // The flows model has not landed: the cells stand as placeholder rows.
  const pending = flowRow && !!focus && !focus.model;
  const src: EventLedgerSource | null = useMemo(
    () =>
      pending
        ? LEDGER_PENDING
        : has
          ? {
              has: () => true,
              render: (side) => <PolarisLedger side={side} eventId={eventId} eventTs={eventTs} />,
            }
          : null,
    [pending, has, eventId, eventTs],
  );
  return <EventLedgerContext.Provider value={src}>{children}</EventLedgerContext.Provider>;
}
