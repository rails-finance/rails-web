"use client";

// A Maple event's ledger (rails-ops reference/lifetime-flows-scrubber.md,
// "Maple"; "The event card's sum"): the card's pool claim opens into the pool's
// flows as of the end of the event's transaction, in the pool's funds asset,
// landing on the claim then. Tokens only: Maple states no USD. The figures come
// from the pool's replay (lib/maple/flows.ts `mapleFocusEvents`); the rows from
// lib/shared/event-ledger.ts; the cells from components/shared/event-ledger.tsx.
// The panel shows one pool at a time, so only that pool's cards open into a
// ledger.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { LEDGER_PENDING } from "@/components/shared/event-ledger-context";
import {
  DayCloseNote,
  EventLedgerContext,
  LedgerTable,
  dayStamp,
  useEventCum,
  type EventLedgerSource,
} from "@/components/shared/event-ledger";
import { eventTokenSum } from "@/lib/shared/flow-focus";
import { tokenLedger } from "@/lib/shared/event-ledger";
import type { FlowSegment } from "@/lib/shared/flows-timeline";
import { flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";

/** The pool the page's Lifetime flows panel shows; null where the page has
 *  no panel. */
export const MapleFlowsPoolContext = createContext<string | null>(null);

/** Whether this card's claim cell opens into a ledger, or stands as a
 *  placeholder row while the panel's model is on its way. */
export function useMapleLedgerCell(eventId: string, pool: string): boolean {
  const focus = useFlowFocus();
  const shown = useContext(MapleFlowsPoolContext);
  if (!focus || shown !== pool) return false;
  if (!focus.model) return true;
  return focus.events.some((e) => e.id === eventId && e.sides);
}

function MapleLedger({ eventId, eventTs }: { eventId: string; eventTs: number }) {
  const focus = useFlowFocus();
  const cum = useEventCum(eventId);
  const model = focus?.model;
  const ev = focus?.events.find((e) => e.id === eventId) ?? null;
  if (!model || !cum || !ev?.sides || !focus) return null;
  const sum = eventTokenSum(model, focus.events, "collateral", cum, eventId);
  if (!sum) return null;
  const f = ev.sides.collateral;
  const ledger = tokenLedger({ model, side: "collateral", ev, sum, usd: null });
  const at = `this event (${dayStamp(eventTs)})`;
  const held: FlowSegment = { key: "collateral-held", label: "Held", fill: "held", width: f.after, value: f.after };
  return (
    <>
      <LedgerTable
        ledger={ledger}
        name="Pool claim"
        at={at}
        totalUsdProv={flowSegmentProv(held, "collateral", at, false, model.daily)}
        daily={model.daily}
      />
      <DayCloseNote cum={cum} eventTs={eventTs} />
    </>
  );
}

/** The card's ledger, where the page ties its timeline to the Lifetime flows
 *  panel and the panel shows this card's pool. */
export function MapleLedgerProvider({
  eventId,
  eventTs,
  pool,
  children,
}: {
  eventId: string;
  eventTs: number;
  pool: string;
  children: ReactNode;
}) {
  const focus = useFlowFocus();
  const shown = useContext(MapleFlowsPoolContext);
  const cum = useEventCum(eventId);
  const mine = !!focus && shown === pool;
  const has = mine && !!focus?.model && cum != null && !!focus.events.find((e) => e.id === eventId)?.sides;
  // The flows model has not landed: the cell stands as a placeholder row.
  const pending = mine && !focus?.model;
  const src: EventLedgerSource | null = useMemo(
    () =>
      pending
        ? LEDGER_PENDING
        : has
          ? {
              has: (side) => side === "collateral",
              render: () => <MapleLedger eventId={eventId} eventTs={eventTs} />,
            }
          : null,
    [pending, has, eventId, eventTs],
  );
  return <EventLedgerContext.Provider value={src}>{children}</EventLedgerContext.Provider>;
}
