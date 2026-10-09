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
import { signedTokens, tokenLedger, type Ledger } from "@/lib/shared/event-ledger";
import type { Provenance } from "@/components/shared/provenance";
import type { FlowSegment } from "@/lib/shared/flows-timeline";
import { flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";

/** The pool the page's Lifetime flows panel shows; null where the page has
 *  no panel. */
export const MapleFlowsPoolContext = createContext<string | null>(null);

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

/** The claim as the day-close card states a balance (components/shared/
 *  flow-moment-card.tsx): what was held before the interest, the interest
 *  since the pool's previous row, and the claim. */
export interface MapleHeld {
  symbol: string;
  /** The claim after the event, and the interest since the previous row. */
  claim: number;
  interest: number;
  /** The previous row's day, which the interest row names. */
  since: string;
  claimProv: Provenance;
  interestProv: Provenance;
  heldProv: Provenance;
}

/** Two places: the asset's cents. */
const HELD_DECIMALS = 2;

function MapleHeldLedger({ held, eventTs }: { held: MapleHeld; eventTs: number }) {
  const scale = 10 ** HELD_DECIMALS;
  const total = Math.round(held.claim * scale);
  const interest = Math.round(held.interest * scale);
  const ledger: Ledger = {
    side: "collateral",
    symbol: held.symbol,
    decimals: HELD_DECIMALS,
    rows: [
      {
        key: "held",
        line: "collateral-held",
        label: "Held",
        role: "flow",
        seg: { key: "collateral-held", label: "Held", fill: "held", width: 0, value: 0 },
        tokens: { units: total - interest, text: signedTokens(total - interest, HELD_DECIMALS) },
        usd: null,
      },
      {
        key: "interest",
        line: "collateral-interest",
        label: `Interest since ${held.since}`,
        role: "interest",
        seg: null,
        tokens: { units: interest, text: signedTokens(interest, HELD_DECIMALS) },
        usd: null,
      },
    ],
    tokens: { before: null, after: signedTokens(total, HELD_DECIMALS), units: total },
    usd: null,
  };
  return (
    <LedgerTable
      ledger={ledger}
      name="Pool claim"
      at={`this event (${dayStamp(eventTs)})`}
      provs={{
        token: (r) => (r.role === "interest" ? held.interestProv : held.heldProv),
        totalTokens: held.claimProv,
      }}
    />
  );
}

/** The card's ledger, where the page ties its timeline to the Lifetime flows
 *  panel and the panel shows this card's pool; elsewhere, with `held`, the
 *  claim's Held and Interest rows. */
export function MapleLedgerProvider({
  eventId,
  eventTs,
  pool,
  held,
  children,
}: {
  eventId: string;
  eventTs: number;
  pool: string;
  /** The claim's rows, for a card with no flows ledger. */
  held?: MapleHeld | null;
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
          : held
            ? {
                has: (side) => side === "collateral",
                render: () => <MapleHeldLedger held={held} eventTs={eventTs} />,
                decimals: () => HELD_DECIMALS,
              }
            : null,
    [pending, has, held, eventId, eventTs],
  );
  return <EventLedgerContext.Provider value={src}>{children}</EventLedgerContext.Provider>;
}
