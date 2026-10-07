"use client";

// A Compound V3 event's ledgers (rails-ops reference/lifetime-flows-scrubber.md,
// "Compound V3"; "The event card's sum"): the card's collateral (or supply)
// and debt cells each open into the side's flows as of the end of the
// event's transaction, landing on what the position held or owed then. A side
// holding one asset reads in its token, with its dollars where the Display
// switches show them; a side holding several reads one short ledger per asset
// with the side's total in dollars. The figures come from the position's
// replay (lib/compound/flows.ts), the rows from lib/shared/event-ledger.ts,
// the cells from components/shared/event-ledger.tsx.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { LEDGER_PENDING } from "@/components/shared/event-ledger-context";
import {
  AssetLedgers,
  DayCloseNote,
  EventLedgerContext,
  LedgerTable,
  SIDE_NAME,
  dayStamp,
  useEventCum,
  type EventLedgerSource,
} from "@/components/shared/event-ledger";
import { usdShown } from "@/lib/shared/usd-display";
import { assetTokenSum, eventAssetSum, eventSideSum, eventSideSumByAsset } from "@/lib/shared/flow-focus";
import { assetLedgers, dollarLedger, tokenLedger } from "@/lib/shared/event-ledger";
import type { FlowSegment, FlowSide } from "@/lib/shared/flows-timeline";
import { flowSegmentProv, ledgerPartProv } from "@/lib/shared/flows-timeline-provenance";
import { compoundSideBalances, type CompoundFlowReplay } from "@/lib/compound/flows";

/** The position's replay, for the cards' ledgers; null where the page has
 *  none (the cells then stand as they always did). */
export const CompoundFlowReplayContext = createContext<CompoundFlowReplay | null>(null);

/** Whether the replay puts anything on a side at the event: a balance once its
 *  transaction ran or before it, or a flow by then. */
function sideHas(rp: CompoundFlowReplay, eventId: string, side: FlowSide): boolean {
  return (compoundSideBalances(rp, eventId, side)?.balances.length ?? 0) > 0;
}

function CompoundSideLedger({ side, eventId, eventTs }: { side: FlowSide; eventId: string; eventTs: number }) {
  const focus = useFlowFocus();
  const rp = useContext(CompoundFlowReplayContext);
  const cum = useEventCum(eventId);
  const model = focus?.model;
  if (!model || !focus || !rp || !cum) return null;
  const at = `this event (${dayStamp(eventTs)})`;
  const ev = focus.events.find((e) => e.id === eventId) ?? null;
  const sb = compoundSideBalances(rp, eventId, side);
  if (!sb) return null;
  const held: FlowSegment = {
    key: `${side}-held`,
    label: side === "collateral" ? "Held" : "Owed",
    fill: "held",
    width: sb.held,
    value: sb.held,
  };
  const totalProv = flowSegmentProv(held, side, at, false, model.daily);
  const beforeProv = ledgerPartProv(SIDE_NAME[side], "USD", at, "held-before");
  const note = <DayCloseNote cum={cum} eventTs={eventTs} />;
  const bySum = eventAssetSum(model, focus.events, side, cum, eventId, sb.balances);
  if (bySum) {
    const shownFor = (sym: string) => {
      const b = bySum.balances.find((x) => x.symbol === sym);
      return usdShown(b?.price != null ? b.amount * b.price : null);
    };
    const single = assetTokenSum(bySum);
    if (single) {
      const dollars = eventSideSumByAsset(model, bySum, cum, sb.held);
      const ledger = tokenLedger({
        model,
        side,
        ev,
        sum: single,
        usd: shownFor(single.symbol)
          ? { lines: dollars.lines, dollars: dollars.total.dollars, before: sb.heldBefore }
          : null,
        price: bySum.balances.find((x) => x.symbol === single.symbol)?.price ?? null,
      });
      return (
        <>
          <LedgerTable
            ledger={ledger}
            name={SIDE_NAME[side]}
            at={at}
            totalUsdProv={totalProv}
            totalUsdBeforeProv={beforeProv}
            daily={model.daily}
          />
          {note}
        </>
      );
    }
    const { assets, usd } = assetLedgers({
      model,
      side,
      ev,
      sum: bySum,
      held: sb.held,
      heldBefore: sb.heldBefore,
    });
    return (
      <>
        <AssetLedgers
          side={side}
          assets={assets}
          usd={usd}
          at={at}
          totalUsdProv={totalProv}
          totalUsdBeforeProv={beforeProv}
          usdShownFor={(l) => l.usd != null && l.symbol != null && shownFor(l.symbol)}
        />
        {note}
      </>
    );
  }
  // The flows before the event do not meet the day rows: the ledger in dollars.
  const rows = eventSideSum(model, side, cum, sb.held);
  const ledger = dollarLedger({
    model,
    side,
    ev,
    lines: rows.lines,
    dollars: rows.total.dollars,
    before: sb.heldBefore,
  });
  return (
    <>
      <LedgerTable
        ledger={ledger}
        name={SIDE_NAME[side]}
        at={at}
        totalUsdProv={totalProv}
        totalUsdBeforeProv={beforeProv}
        daily={model.daily}
      />
      {note}
    </>
  );
}

/** Whether the card's cells open into ledgers: true where the page ties its
 *  timeline to the Lifetime flows panel, its model has landed and holds this
 *  event; "pending" while the model is on its way. */
export function useCompoundLedgerState(eventId: string): "pending" | "ready" | null {
  const focus = useFlowFocus();
  const rp = useContext(CompoundFlowReplayContext);
  if (!focus) return null;
  if (!focus.model || !rp) return "pending";
  return rp.replayed.some((r) => r.ev.id === eventId) ? "ready" : null;
}

/** The card's ledgers, where the page ties its timeline to the Lifetime
 *  flows panel. */
export function CompoundLedgerProvider({
  eventId,
  eventTs,
  children,
}: {
  eventId: string;
  eventTs: number;
  children: ReactNode;
}) {
  const focus = useFlowFocus();
  const rp = useContext(CompoundFlowReplayContext);
  const cum = useEventCum(eventId);
  const state = useCompoundLedgerState(eventId);
  const src: EventLedgerSource | null = useMemo(
    () =>
      state === "pending"
        ? LEDGER_PENDING
        : state === "ready" && cum && rp && focus?.model
          ? {
              has: (side) => sideHas(rp, eventId, side),
              render: (side) => <CompoundSideLedger side={side} eventId={eventId} eventTs={eventTs} />,
            }
          : null,
    [state, cum, rp, focus?.model, eventId, eventTs],
  );
  return <EventLedgerContext.Provider value={src}>{children}</EventLedgerContext.Provider>;
}
