"use client";

// A MakerDAO vault event's ledgers (rails-ops reference/lifetime-flows-scrubber.md,
// "MakerDAO"; "The event card's sum"): the card's Collateral and Debt cells
// each open into the side's flows as of the end of the event's transaction,
// in the side's token (the gem, the debt token), landing on what the vault
// held or owed then. USD follows the timeline's Display switches. The figures
// come from the vault's replay (lib/makerdao/flows.ts `makerFocusEvents`); the
// rows from lib/shared/event-ledger.ts; the cells from
// components/shared/event-ledger.tsx.

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
import { usdShown } from "@/lib/shared/usd-display";
import { eventSideSum, eventTokenSum } from "@/lib/shared/flow-focus";
import { tokenLedger } from "@/lib/shared/event-ledger";
import type { FlowSegment, FlowSide } from "@/lib/shared/flows-timeline";
import { flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";

/** Which cells open into ledgers: the Collateral always, the Debt where the
 *  vault ever owed. Null without a model. */
export function useMakerLedgerCells(): { debt: boolean } | null {
  const focus = useFlowFocus();
  const model = focus?.model;
  const events = focus?.events;
  return useMemo(
    () =>
      model && events ? { debt: events.some((e) => (e.sides?.debt.held ?? 0) > 0 || e.sides?.debt.amount) } : null,
    [model, events],
  );
}

function MakerLedger({ side, eventId, eventTs }: { side: FlowSide; eventId: string; eventTs: number }) {
  const focus = useFlowFocus();
  const cum = useEventCum(eventId);
  const model = focus?.model;
  const ev = focus?.events.find((e) => e.id === eventId) ?? null;
  if (!model || !cum || !ev?.sides || !focus) return null;
  const sum = eventTokenSum(model, focus.events, side, cum, eventId);
  if (!sum) return null;
  const f = ev.sides[side];
  // The debt at its $1 face: its USD is its token amount.
  const usd = usdShown(side === "debt" ? f.held : f.after);
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
export function MakerLedgerProvider({
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
  const cells = useMakerLedgerCells();
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
              render: (side) => <MakerLedger side={side} eventId={eventId} eventTs={eventTs} />,
              decimals: (side) =>
                focus?.model && cum
                  ? (eventTokenSum(focus.model, focus.events, side, cum, eventId)?.decimals ?? null)
                  : null,
            }
          : null,
    [pending, has, cells, eventId, eventTs, focus?.model, focus?.events, cum],
  );
  return <EventLedgerContext.Provider value={src}>{children}</EventLedgerContext.Provider>;
}
