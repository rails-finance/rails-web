// A Liquity V2 event page's Copy for LLM text, built from what the page reads:
// the Trove's history, its listing row, the oracle prices, the branch's daily
// prices and the liquidation's surplus read. The same inputs the page's client
// half (event/[eventId]/event-view.tsx) hands the card, run through the same
// replay, generator and Markdown (lib/liquity/event-markdown.ts), so the text
// matches the card's Copy for LLM character for character. The raw Markdown
// route (event/[eventId]/markdown/route.ts, served at `…/event/<id>.md`) calls
// it; it reads nothing.

import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import type { TroveSummary } from "@/types/api/trove";
import type { OraclePricesData } from "@/types/api/oracle";
import type { CollSurplusClaim } from "@/lib/sources/chain/liquity-coll-surplus";
import { liquityFlowTimeline, liquityFocusEvents, liquityV2FlowEvents } from "@/lib/shared/liquity-flows";
import { buildFlowModel } from "@/lib/shared/flows-timeline";
import { eventPagePlace, troveHolder } from "@/lib/liquity/event-page";
import { liquityEventDecimals, liquityEventLedger } from "@/lib/liquity/event-ledgers";
import { DEFAULT_USD_SWITCHES, liquityEventProse } from "@/lib/liquity/event-prose";
import { liquityEventMarkdown } from "@/lib/liquity/event-markdown";

export interface EventPageMarkdownInput {
  collateralType: string;
  troveId: string;
  /** Decoded. */
  eventId: string;
  trove: TroveSummary;
  events: BaseActivityEvent[];
  /** The route's count where its first page stopped short, else null. */
  totalEvents: number | null;
  prices: OraclePricesData | null;
  /** The branch's daily price, `[UTC day, usd]` ascending; null where unread. */
  dailyColl: [number, number][] | null;
  /** A liquidated Trove's surplus at the head: the crediting transaction and
   *  its claim. Null where the liquidation credited none or the read failed. */
  surplus: { creditTx: string; claimed: CollSurplusClaim | null } | null;
  /** Unix seconds now. */
  now: number;
  /** The site the event's link points at. */
  origin: string;
}

/** The trove page's path for an event, as the page's share link writes it. */
export function liquityEventPath(collateralType: string, troveId: string, eventId: string): string {
  return `/ethereum/liquity-v2/trove/${collateralType}/${troveId}/event/${encodeURIComponent(eventId)}`;
}

/** The event's Copy for LLM text; null where the history lacks the event. */
export function liquityEventPageMarkdown(input: EventPageMarkdownInput): string | null {
  const { collateralType, troveId, eventId, trove, prices, surplus } = input;
  const place = eventPagePlace(input.events, eventId, input.totalEvents);
  const { events, event, previous, n, total } = place;
  if (!event) return null;

  const owner = troveHolder(trove).address;
  const collSymbol = trove.collateralType ?? collateralType;
  const debtSymbol = events[0]?.context.data.assetType || "BOLD";
  const currentPrice = prices?.[collSymbol.toLowerCase() as keyof OraclePricesData];
  const flowEvents = liquityV2FlowEvents(events);
  const timeline = liquityFlowTimeline(flowEvents, {
    collSymbol,
    debtSymbol,
    surplusClaimed: surplus?.claimed != null,
    now: input.now,
    dailyColl: input.dailyColl,
    live: trove.status === "open" ? { price: currentPrice ?? null } : null,
  });
  const model = timeline ? buildFlowModel(timeline) : null;
  const focusEvents = liquityFocusEvents(flowEvents, collSymbol, debtSymbol);

  const ctx = event.context.data;
  const claim =
    ctx.operation === "liquidate" && surplus && surplus.creditTx.toLowerCase() === event.txHash.toLowerCase()
      ? surplus.claimed
      : null;
  const prose = liquityEventProse({
    ctx,
    event,
    previousEvent: previous,
    currentEvent: event,
    currentPrice,
    ledger: focusEvents.find((e) => e.id === event.id) ?? null,
    collDecimals: model ? liquityEventDecimals(model, focusEvents, event.id, "collateral") : null,
    debtDecimals: model ? liquityEventDecimals(model, focusEvents, event.id, "debt") : null,
    surplusClaimedAt: claim ? claim.timestamp : undefined,
  });
  const ledgers = model
    ? {
        collateral: liquityEventLedger(model, focusEvents, event.id, "collateral", DEFAULT_USD_SWITCHES),
        debt: liquityEventLedger(model, focusEvents, event.id, "debt", DEFAULT_USD_SWITCHES),
      }
    : null;
  return liquityEventMarkdown(
    prose,
    {
      troveId: ctx.troveId,
      owner,
      n,
      total,
      url: `${input.origin}${liquityEventPath(collateralType, troveId, event.id)}`,
      timestamp: event.timestamp,
    },
    ledgers,
  );
}
