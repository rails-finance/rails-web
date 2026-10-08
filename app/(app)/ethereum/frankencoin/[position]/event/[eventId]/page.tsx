import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { normalizePositionAddress } from "@/lib/frankencoin/asset-catalog";
import { loadFrankencoinPositionTail } from "@/lib/frankencoin/position-page-data";
import { frankencoinEventPageDescription } from "@/lib/frankencoin/explorer";
import FrankencoinPositionPage from "../../page";

interface Props {
  params: Promise<{ position: string; eventId: string }>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the route
// renders per request over a `no-store` backend read, same as the parent.
export const dynamic = "force-dynamic";

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadFrankencoinPositionTail` is the same `cache()`-wrapped read the parent
// page and its own opengraph-image already call, so finding the event here
// costs no second backend round trip within one request.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { position: raw, eventId } = await params;
  const position = normalizePositionAddress(raw ?? "");
  const decoded = decodeEventId(eventId);
  const tail = position ? await loadFrankencoinPositionTail(position) : null;
  const event = tail?.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "frankencoin",
    subject: position ?? raw,
    canonicalPath: `/ethereum/frankencoin/${position ?? raw}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
    description:
      event && position && tail?.position
        ? frankencoinEventPageDescription(tail.position.collateralSymbol, position, event.timestamp)
        : undefined,
  });
}

// The event page (rails-ops TO-DO-ui-jobs 236): the parent position page's
// server half, same params; its client half (`FrankencoinPositionView`) reads
// `eventId` from the route and draws the sub-nav and the event's card in page
// mode with the shared column (`ChainTruthTimeline`'s `eventPage`).
export default async function FrankencoinEventPage({ params }: Props) {
  return FrankencoinPositionPage({ params });
}
