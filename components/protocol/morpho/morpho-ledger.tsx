"use client";

// A Morpho event's ledgers (rails-ops reference/lifetime-flows-scrubber.md,
// "Morpho"; "The event card's sum"): the card's Collateral (or, for a lender,
// Supplied) and Debt cells each open into the side's flows as of the end of
// the event's transaction, in the side's token, landing on what the position
// held or owed then. Tokens only: Morpho states no USD, and the page has no
// USD switches. The figures come from the position's replay
// (lib/morpho/flows.ts `morphoFocusEvents`); the rows from
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
import { eventTokenSum } from "@/lib/shared/flow-focus";
import { tokenLedger } from "@/lib/shared/event-ledger";
import type { FlowSegment, FlowSide } from "@/lib/shared/flows-timeline";
import { flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";
import { MO } from "@/lib/morpho/flows";

/** Which cell holds the collateral side's ledger: the borrower's Collateral,
 *  a lender's Supplied, or none where the side holds both (its tokens do not
 *  add). Null without a model. */
export function useMorphoLedgerCells(): { collateral: "collateral" | "supply" | null; debt: boolean } | null {
  const model = useFlowFocus()?.model;
  return useMemo(() => {
    if (!model) return null;
    const has = (k: string) => model.buckets.some((b) => b.key === k);
    const borrower = has(MO.collIn);
    const lender = has(MO.supplied);
    return { collateral: borrower && lender ? null : borrower ? "collateral" : "supply", debt: borrower };
  }, [model]);
}

function MorphoLedger({ side, eventId, eventTs }: { side: FlowSide; eventId: string; eventTs: number }) {
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
        name={side === "collateral" && f.symbol === model.unit?.symbol ? "Supplied" : SIDE_NAME[side]}
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
export function MorphoLedgerProvider({
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
  const cells = useMorphoLedgerCells();
  const has = !!focus?.model && cum != null && !!focus.events.find((e) => e.id === eventId)?.sides;
  const src: EventLedgerSource | null = useMemo(
    () =>
      has && cells
        ? {
            has: (side) => (side === "debt" ? cells.debt : cells.collateral != null),
            render: (side) => <MorphoLedger side={side} eventId={eventId} eventTs={eventTs} />,
          }
        : null,
    [has, cells, eventId, eventTs],
  );
  return <EventLedgerContext.Provider value={src}>{children}</EventLedgerContext.Provider>;
}
