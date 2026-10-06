import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { loadTroveHistory, loadTroveTail } from "@/lib/liquity/trove-page-data";
import { truncateTroveId } from "@/lib/liquity/share-card";
import EventView from "./event-view";

interface Props {
  params: Promise<{ collateralType: string; troveId: string; eventId: string }>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the parent
// route renders per request, so this segment does too.
export const dynamic = "force-dynamic";

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadTroveTail` is the same `cache()`-wrapped read the page body and the
// opengraph-image call, so finding the event here costs no second backend
// round trip within one request.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collateralType, troveId, eventId } = await params;
  const collateralDisplay = collateralType === "WETH" ? "ETH" : collateralType;
  const decoded = decodeEventId(eventId);
  const tail = await loadTroveTail(collateralType, troveId);
  const event = tail.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "liquity-v2",
    subject: truncateTroveId(troveId),
    market: `${collateralDisplay}/BOLD`,
    canonicalPath: `/ethereum/liquity-v2/trove/${collateralType}/${troveId}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
  });
}

// The event page (rails-ops TO-DO-ui-jobs 236): the position's summary, the
// previous and next events, and this event's card opened. The card's ledgers
// replay the Trove's history, so the read is the history; the page draws one
// event of it.
export default async function LiquityV2EventPage({ params }: Props) {
  const { collateralType, troveId, eventId } = await params;
  const history = await loadTroveHistory(collateralType, troveId);
  if (history.missing) notFound();
  return (
    <EventView
      key={`${collateralType}:${troveId}:${eventId}`}
      collateralType={collateralType}
      troveId={troveId}
      eventId={decodeEventId(eventId)}
      trove={history.trove}
      events={history.events}
      totalEvents={history.hasMore ? history.totalEvents : null}
      prices={history.prices}
    />
  );
}
