"use client";

// An f(x) event's ledgers (rails-ops reference/lifetime-flows-scrubber.md,
// "f(x)"; "The event card's sum"): the card's Collateral and Debt cells each
// open into the side's flows as of the end of the event's transaction, in the
// side's token, landing on what the position held or owed then. Tokens only:
// f(x) states no USD. The figures come from the position's replay
// (lib/fx/flows.ts `fxFocusEvents`); the rows from
// lib/shared/event-ledger.ts; the cells from components/shared/event-ledger.tsx.

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
import { FXF } from "@/lib/fx/flows";

/** Which cells open into ledgers: the Collateral always, the Debt where the
 *  position ever borrowed. Null without a model. */
export function useFxLedgerCells(): { debt: boolean } | null {
  const model = useFlowFocus()?.model;
  return useMemo(() => (model ? { debt: model.buckets.some((b) => b.key === FXF.borrowed) } : null), [model]);
}

function FxLedger({ side, eventId, eventTs }: { side: FlowSide; eventId: string; eventTs: number }) {
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
 *  flows panel. */
export function FxLedgerProvider({
  eventId,
  eventTs,
  children,
}: {
  eventId: string;
  eventTs: number;
  children: ReactNode;
}) {
  const focus = useFlowFocus();
  const cum = useEventCum(eventId);
  const cells = useFxLedgerCells();
  const has = !!focus?.model && cum != null && !!focus.events.find((e) => e.id === eventId)?.sides;
  // The flows model has not landed: the cells stand as placeholder rows.
  const pending = !!focus && !focus.model;
  const src: EventLedgerSource | null = useMemo(
    () =>
      pending
        ? LEDGER_PENDING
        : has && cells
          ? {
              has: (side) => (side === "debt" ? cells.debt : true),
              render: (side) => <FxLedger side={side} eventId={eventId} eventTs={eventTs} />,
            }
          : null,
    [pending, has, cells, eventId, eventTs],
  );
  return <EventLedgerContext.Provider value={src}>{children}</EventLedgerContext.Provider>;
}
