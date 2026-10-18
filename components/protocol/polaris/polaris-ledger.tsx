"use client";

// A Polaris event's ledgers (rails-ops reference/lifetime-flows-scrubber.md,
// "Polaris"; "The event card's sum"): the card's Collateral and Debt cells
// each open into the side's flows as of the end of the event's transaction,
// the collateral in pETH and the debt in the market's stablecoin, landing on
// what the CDP held or owed then. Tokens only: the page states no USD. The
// figures come from the CDP's replay (lib/polaris/flows.ts
// `polarisFocusEvents`); the rows from lib/shared/event-ledger.ts; the cells
// from components/shared/event-ledger.tsx. Under the Collateral ledger, the
// gas compensation escrow on lines of its own, held apart from the
// collateral, so the pETH the wallet sent and got back adds up beside it.

import { useMemo, type ReactNode } from "react";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { LEDGER_PENDING } from "@/components/shared/event-ledger-context";
import {
  DayCloseNote,
  EventLedgerContext,
  LedgerIcon,
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
import type { PolarisContext } from "@/lib/shared/types/event-shape";
import { Prov, type Provenance } from "@/components/shared/provenance";
import {
  gasCompEscrowProv,
  gasCompReturnProv,
  liquidationFieldProv,
  type PolarisCoords,
} from "@/lib/polaris/event-provenance";
import { PETH } from "@/lib/polaris/asset-catalog";
import { formatPeth } from "@/lib/polaris/figure-format";
import { POLARIS_LIQ_CONSTANTS } from "./polaris-liquidation-forensics";
import { POLARIS_WORDS } from "@/lib/polaris/event-templates";

/** What the card hands the ledger to state the escrow: the event and its
 *  coordinates for the receipts. */
export interface PolarisEscrowAt {
  ctx: PolarisContext;
  coords: PolarisCoords;
}

const ESCROW_WORDS = {
  heading: POLARIS_WORDS.ledger_escrow,
  sent: POLARIS_WORDS.ledger_escrow_sent,
  returned: POLARIS_WORDS.ledger_escrow_returned,
  paid: POLARIS_WORDS.ledger_escrow_paid,
  held: POLARIS_WORDS.ledger_escrow_held,
};

/** The escrow's lines as of the event: sent at the open, and returned at the
 *  close or paid to the liquidator, landing on what the CDP holds. In pETH,
 *  the protocol's constant (POLARIS_LIQ_CONSTANTS.gasComp). */
function EscrowLines({ at }: { at: PolarisEscrowAt }) {
  const { ctx, coords } = at;
  const amount = POLARIS_LIQ_CONSTANTS.gasComp.amount;
  const flat = ctx.eventType === "liquidate" && ctx.flatComp != null ? Number(ctx.flatComp) : amount;
  const out: { label: string; info: Provenance; n: number } | null =
    ctx.eventType === "close"
      ? { label: ESCROW_WORDS.returned, info: gasCompReturnProv(coords), n: amount }
      : ctx.eventType === "liquidate"
        ? { label: ESCROW_WORDS.paid, info: liquidationFieldProv("flatComp", coords, ctx.raw?.flatComp), n: flat }
        : null;
  const held = out ? amount - out.n : amount;
  const line = (key: string, label: string, text: string, info: Provenance | null, value: string, total = false) => (
    <div key={key} className="contents" data-ledger-escrow-row={key}>
      <span className={`min-w-0 py-1 ${total ? "text-foreground" : "text-rb-500"}`}>{label}</span>
      <span
        className={`inline-flex items-center justify-end gap-1.5 py-1 ${total ? "font-semibold text-foreground" : ""}`}
      >
        {info ? (
          <Prov info={info} value={value}>
            <span>{text}</span>
          </Prov>
        ) : (
          <span>{text}</span>
        )}
        <LedgerIcon symbol={PETH.symbol} muted={!total} />
      </span>
    </div>
  );
  return (
    <div className="mt-3 border-t border-dashed border-rb-300 pt-2 dark:border-rb-600" data-ledger-escrow="">
      <p className="text-sm text-rb-500">{ESCROW_WORDS.heading}</p>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-sm tabular-nums">
        {line("sent", ESCROW_WORDS.sent, `+${formatPeth(amount)}`, gasCompEscrowProv(coords), String(amount))}
        {out && line("out", out.label, `−${formatPeth(out.n)}`, out.info, String(out.n))}
        <div aria-hidden className="col-span-full mt-1 border-t border-rb-300 dark:border-rb-600" />
        {line("held", ESCROW_WORDS.held, formatPeth(held), null, String(held), true)}
      </div>
    </div>
  );
}

function PolarisLedger({
  side,
  eventId,
  eventTs,
  escrow,
}: {
  side: FlowSide;
  eventId: string;
  eventTs: number;
  escrow?: PolarisEscrowAt;
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
      {side === "collateral" && escrow && <EscrowLines at={escrow} />}
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
  escrow,
  children,
}: {
  eventId: string;
  eventTs: number;
  flowRow: boolean;
  /** The escrow's lines under the Collateral ledger; every flow row has
   *  them (the CDP's history starts at its open). */
  escrow?: PolarisEscrowAt;
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
              render: (side) => <PolarisLedger side={side} eventId={eventId} eventTs={eventTs} escrow={escrow} />,
            }
          : null,
    [pending, has, eventId, eventTs, escrow],
  );
  return <EventLedgerContext.Provider value={src}>{children}</EventLedgerContext.Provider>;
}
