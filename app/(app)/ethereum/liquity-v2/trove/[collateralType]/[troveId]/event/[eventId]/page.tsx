import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { loadTroveHistory } from "@/lib/liquity/trove-page-data";
import { eventHeadingWords, eventPageDescription, eventPagePlace, troveHolder } from "@/lib/liquity/event-page";
import { truncateTroveId } from "@/lib/liquity/share-card";
import type { OraclePricesData } from "@/types/api/oracle";
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
// `loadTroveHistory` is the same `cache()`-wrapped read the page body makes,
// so finding the event here costs no second backend round trip within one
// request. The description is `page_words.description`; the title's last words
// are the heading's (`eventHeadingWords`).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collateralType, troveId, eventId } = await params;
  const collateralDisplay = collateralType === "WETH" ? "ETH" : collateralType;
  const decoded = decodeEventId(eventId);
  const history = await loadTroveHistory(collateralType, troveId);
  const event = history.events?.find((e) => e.id === decoded) ?? null;
  const place = eventPagePlace(history.events ?? [], decoded, history.hasMore ? history.totalEvents : null);
  const holder = troveHolder(history.trove);
  const currentPrice = history.prices?.[collateralType.toLowerCase() as keyof OraclePricesData];
  const heading = eventHeadingWords(place, currentPrice);
  const description =
    place.event && history.trove
      ? eventPageDescription({
          collSymbol: history.trove.collateralType,
          troveId,
          owner: holder.address,
          ownerEns: history.trove.ownerEns ?? null,
          lastOwner: holder.last,
          n: place.n,
          total: place.total,
          timestamp: place.event.timestamp,
        })
      : null;
  return eventMetadata({
    session: "liquity-v2",
    subject: truncateTroveId(troveId),
    market: `${collateralDisplay}/BOLD`,
    canonicalPath: `/ethereum/liquity-v2/trove/${collateralType}/${troveId}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: heading ?? event.actionLabel, timestamp: event.timestamp } : null,
    description: description ?? undefined,
  });
}

// The event page (rails-ops TO-DO-ui-jobs 236): this event's card in its page
// mode and the side column beside it. The card's ledgers replay the Trove's
// history, so the read is the history; the page draws one event of it.
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
