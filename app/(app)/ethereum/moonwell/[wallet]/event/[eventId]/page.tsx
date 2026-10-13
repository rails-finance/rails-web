import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { moonwellEventHeading, moonwellEventPageDescription } from "@/lib/moonwell/explorer";
import { loadMoonwellPositionTail } from "@/lib/moonwell/position-page-data";
import MoonwellPositionPage from "../../page";

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the route
// renders per request over a `no-store` backend read, same as the parent.
export const dynamic = "force-dynamic";

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadMoonwellPositionTail` is the same `cache()`-wrapped read the parent
// page and its own opengraph-image already call, so finding the event here
// costs no second backend round trip within one request.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  const decoded = decodeEventId(eventId);
  const tail = await loadMoonwellPositionTail(wallet);
  const event = tail.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "moonwell",
    subject: wallet,
    canonicalPath: `/ethereum/moonwell/${wallet}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: moonwellEventHeading(event), timestamp: event.timestamp } : null,
    description: event ? moonwellEventPageDescription("ethereum", wallet, event.timestamp) : undefined,
  });
}

// The event page (rails-ops TO-DO-ui-jobs 236): the parent position page's
// server half, same params; its client half (`MoonwellPositionView`) reads `eventId`
// from the route and draws the sub-nav and the event's card in page mode with
// the shared column (`ChainTruthTimeline`'s `eventPage`). The card reads the
// account's history, so the read is the parent's.
export default async function MoonwellEventPage({ params }: Props) {
  return MoonwellPositionPage({ params });
}
