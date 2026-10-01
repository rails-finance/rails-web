"use client";

// A Liquity-family Trove event's ledgers (rails-ops
// reference/lifetime-flows-scrubber.md, "The event card's sum"): the card's
// Collateral and Debt cells each open into the side's flows as of the end of
// the event's transaction, in the side's token (the collateral token, the
// stablecoin), landing on what the Trove held or owed then. USD follows the
// timeline's Display switches ("USD for other tokens" for the collateral,
// "USD for stablecoins" for the debt). The figures come from the Trove's
// replay (lib/shared/liquity-flows.ts `liquityFocusEvents`); the rows from
// lib/shared/event-ledger.ts; the cells from components/shared/event-ledger.tsx.

import { useMemo, type ReactNode } from "react";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import {
  DayCloseNote,
  EventLedgerContext,
  LedgerTable,
  SIDE_NAME,
  dayStamp,
  useEventCum,
  type EventLedgerSource,
} from "@/components/shared/event-ledger";
import { useUsdShown } from "@/components/shared/timeline-display-context";
import { eventSideSum, eventTokenSum } from "@/lib/shared/flow-focus";
import { tokenLedger } from "@/lib/shared/event-ledger";
import type { FlowSegment, FlowSide } from "@/lib/shared/flows-timeline";
import { flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";

/** One side's ledger as of the event. */
function LiquityLedger({ side, eventId, eventTs }: { side: FlowSide; eventId: string; eventTs: number }) {
  const focus = useFlowFocus();
  const cum = useEventCum(eventId);
  const usdShown = useUsdShown();
  const model = focus?.model;
  const ev = focus?.events.find((e) => e.id === eventId) ?? null;
  if (!model || !cum || !ev?.sides || !focus) return null;
  const sum = eventTokenSum(model, focus.events, side, cum, eventId);
  if (!sum) return null;
  const f = ev.sides[side];
  // The debt at its $1 face: its USD is its token amount.
  const usd = usdShown(f.symbol, side === "debt" ? f.held : f.after, f.held);
  const rows = usd ? eventSideSum(model, side, cum, f.after) : null;
  const ledger = tokenLedger({
    model,
    side,
    ev,
    sum,
    usd: rows ? { lines: rows.lines, dollars: rows.total.dollars, before: f.before } : null,
  });
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
 *  flows panel and the replay states the event's sides. */
export function LiquityLedgerProvider({
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
  const has = !!focus?.model && cum != null && !!focus.events.find((e) => e.id === eventId)?.sides;
  const src: EventLedgerSource | null = useMemo(
    () =>
      has
        ? {
            has: () => true,
            render: (side) => <LiquityLedger side={side} eventId={eventId} eventTs={eventTs} />,
          }
        : null,
    [has, eventId, eventTs],
  );
  return <EventLedgerContext.Provider value={src}>{children}</EventLedgerContext.Provider>;
}
