"use client";

// A LlamaLend event's ledgers (rails-ops reference/lifetime-flows-scrubber.md,
// "LlamaLend"; "The event card's sum"): the card's Collateral and Debt cells
// each open into the side's flows as of the end of the event's transaction,
// in the side's token, landing on what the position held or owed then. Tokens
// only: the page states no USD. The figures come from the position's replay
// (lib/llamalend/flows.ts `llamalendFocusEvents`); the rows from
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
import { LL } from "@/lib/llamalend/flows";
import type { LlamalendContext } from "@/lib/shared/types/event-shape";
import type { LlamalendCoords } from "@/lib/llamalend/event-provenance";
import { ConvertedFigure, useLlamalendConverted } from "./llamalend-cells";

/** The event the card states, for the Collateral ledger's Converted row. */
interface LlamalendLedgerEvent {
  ctx: LlamalendContext;
  coords: LlamalendCoords;
}

/** The Collateral ledger's last row: the borrowed token the AMM held from sold
 *  collateral, before → after the event, where there was any. It is in the
 *  borrowed token, so it stands after the collateral's total. */
function ConvertedRow({ ctx, coords }: LlamalendLedgerEvent) {
  const c = useLlamalendConverted(ctx, coords);
  if (!c) return null;
  return (
    <div className="flex items-baseline gap-2 py-1 text-sm text-rb-500" data-ledger-row="converted">
      <span>Converted{c.soft ? ", in soft-liquidation" : ""}</span>
      <span className="ml-auto whitespace-nowrap text-right font-semibold text-foreground tabular-nums">
        <ConvertedFigure c={c} />
      </span>
    </div>
  );
}

/** Which cells open into ledgers: the Collateral and the Debt. Null without
 *  a model. */
export function useLlamalendLedgerCells(): { debt: boolean } | null {
  const model = useFlowFocus()?.model;
  return useMemo(() => (model ? { debt: model.buckets.some((b) => b.key === LL.borrowed) } : null), [model]);
}

function LlamalendLedger({
  side,
  eventId,
  eventTs,
  event,
}: {
  side: FlowSide;
  eventId: string;
  eventTs: number;
  event?: LlamalendLedgerEvent;
}) {
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
      {side === "collateral" && event && <ConvertedRow {...event} />}
      <DayCloseNote cum={cum} eventTs={eventTs} />
    </>
  );
}

/** The card's ledgers, where the page ties its timeline to the Lifetime
 *  flows panel. */
export function LlamalendLedgerProvider({
  eventId,
  eventTs,
  event,
  children,
}: {
  eventId: string;
  eventTs: number;
  /** The event, for the Collateral ledger's Converted row. */
  event?: LlamalendLedgerEvent;
  children: ReactNode;
}) {
  const focus = useFlowFocus();
  const cum = useEventCum(eventId);
  const cells = useLlamalendLedgerCells();
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
              render: (side) => <LlamalendLedger side={side} eventId={eventId} eventTs={eventTs} event={event} />,
            }
          : null,
    [pending, has, cells, eventId, eventTs, event],
  );
  return <EventLedgerContext.Provider value={src}>{children}</EventLedgerContext.Provider>;
}
