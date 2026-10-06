// A Liquity V2 trove's events run through the prose generator, the way the
// trove page runs them: the replay (lib/shared/liquity-flows.ts), each event's
// ledgers and decimals, then liquityEventProse. The test exports
// (scripts/exports-liquity-v2.mjs) and the JSON route
// (app/api/liquity-v2/event-prose/route.ts) call it with what they read; it
// reads nothing.

import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import type { TroveSummary } from "@/types/api/trove";
import { isLiquityEvent } from "@/lib/shared/types/event-shape";
import { liquityFlowTimeline, liquityFocusEvents, liquityV2FlowEvents } from "@/lib/shared/liquity-flows";
import { buildFlowModel } from "@/lib/shared/flows-timeline";
import { liquityEventDecimals, liquityEventLedger } from "@/lib/liquity/event-ledgers";
import { liquityEventProse, type LiquityEventContext, type LiquityEventProse } from "@/lib/liquity/event-prose";
import type { LiquityEventLedgers } from "@/lib/liquity/event-markdown";

type LiquityEvent = BaseActivityEvent & { context: { protocol: "liquity-v2-troves"; data: LiquityContext } };

export interface LiquityProseRow {
  event: LiquityEvent;
  p: LiquityEventProse;
  l3: LiquityEventLedgers | null;
  c: LiquityEventContext;
}

const logIndex = (e: BaseActivityEvent) => {
  const n = Number(e.id.split("_").pop());
  return Number.isFinite(n) ? n : 0;
};

/** A trove's Liquity V2 events in the trove page's order: block, time, then
 *  the log's index in the block. */
export function liquityTroveHistory(events: BaseActivityEvent[]): LiquityEvent[] {
  return events
    .filter(isLiquityEvent)
    .sort((a, b) => a.blockNumber - b.blockNumber || a.timestamp - b.timestamp || logIndex(a) - logIndex(b));
}

export interface LiquityPositionInput {
  branch: string;
  troveId: string;
  /** The trove's whole history, in liquityTroveHistory's order. */
  events: LiquityEvent[];
  trove: TroveSummary | null;
  /** The branch's daily price, `[UTC day, usd]` ascending, where read. */
  dailyColl: [number, number][] | null;
  /** Today's oracle price for the branch's collateral. */
  priceToday: number | undefined;
  /** Unix seconds now. */
  now: number;
  /** The site the event links point at. */
  site: string;
}

/** Every event of the trove, as the page's generator sees it. */
export function liquityPositionProse(input: LiquityPositionInput): LiquityProseRow[] {
  const { branch, troveId, events, trove, priceToday } = input;
  const collSym = trove?.collateralType ?? branch;
  const debtSym = events[0]?.context.data.assetType || "BOLD";
  const flowEvents = liquityV2FlowEvents(events);
  const tl = liquityFlowTimeline(flowEvents, {
    collSymbol: collSym,
    debtSymbol: debtSym,
    surplusClaimed: false,
    now: input.now,
    dailyColl: input.dailyColl,
    live: trove?.status === "open" ? { price: priceToday ?? null } : null,
  });
  const model = tl ? buildFlowModel(tl) : null;
  const focusEvents = liquityFocusEvents(flowEvents, collSym, debtSym);
  const owner = trove ? (trove.status === "open" ? trove.owner : trove.lastOwner) : null;
  return events.map((event, i) => {
    const p = liquityEventProse({
      ctx: event.context.data,
      event,
      previousEvent: i > 0 ? events[i - 1] : undefined,
      currentEvent: event,
      currentPrice: priceToday,
      ledger: focusEvents.find((e) => e.id === event.id) ?? null,
      collDecimals: model ? liquityEventDecimals(model, focusEvents, event.id, "collateral") : null,
      debtDecimals: model ? liquityEventDecimals(model, focusEvents, event.id, "debt") : null,
    });
    const l3 = model
      ? {
          collateral: liquityEventLedger(model, focusEvents, event.id, "collateral"),
          debt: liquityEventLedger(model, focusEvents, event.id, "debt"),
        }
      : null;
    const url = `${input.site}/ethereum/liquity-v2/trove/${branch}/${troveId}/event/${encodeURIComponent(event.id)}`;
    const c = { troveId, owner, n: i + 1, total: events.length, url, timestamp: event.timestamp };
    return { event, p, l3, c };
  });
}
