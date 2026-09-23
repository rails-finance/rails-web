import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { shortId } from "@/lib/basedollar/asset-catalog";
import { loadBasedollarTroveTail } from "@/lib/basedollar/trove-page-data";
import BasedollarTrovePage from "../../page";

interface Props {
  params: Promise<{ collateralType: string; troveId: string; eventId: string }>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the parent
// route renders per request, so this segment does too.
export const dynamic = "force-dynamic";

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadBasedollarTroveTail` is the same `cache()`-wrapped read the parent
// page and its own opengraph-image already call, so finding the event here
// costs no second backend round trip within one request.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collateralType, troveId, eventId } = await params;
  const decoded = decodeEventId(eventId);
  const tail = await loadBasedollarTroveTail(collateralType, troveId);
  const event = tail.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "basedollar",
    subject: shortId(troveId),
    // Matches the page's own `generateMetadata` exactly — the branch symbol
    // alone, not paired with the debt symbol.
    market: collateralType,
    canonicalPath: `/base/basedollar/${collateralType}/${troveId}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
  });
}

// THIN: renders the exact same parent trove page, same params — the nested
// `event/[eventId]` segment sits inside the same `[troveId]` layout, so every
// provider still wraps it, and `BasedollarTroveDetail` (this page's client
// half) never learns a new prop. It finds out it is on an event route from
// `useParams().eventId` itself, inside `ChainTruthTimeline` — see that
// component's pinned-mode branch. `params` here carries an extra `eventId`
// key the parent's own `Props` type doesn't declare; passing the same
// promise through is still structurally valid (the parent only reads
// `collateralType`/`troveId` off it).
export default async function BasedollarEventPage({ params }: Props) {
  return BasedollarTrovePage({ params });
}
