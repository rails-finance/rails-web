import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { parseFxPositionSlug } from "@/lib/fx/asset-catalog";
import { loadFxPositionTail } from "@/lib/fx/position-page-data";
import { fxEventHeading, fxEventPageDescription } from "@/lib/fx/explorer";
import FxPositionPage from "../../page";

interface Props {
  params: Promise<{ position: string; eventId: string }>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the route
// renders per request over a `no-store` backend read, same as the parent.
export const dynamic = "force-dynamic";

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadFxPositionTail` is the same `cache()`-wrapped read the parent page and
// its own opengraph-image already call, so finding the event here costs no
// second backend round trip within one request.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { position: slug, eventId } = await params;
  const decoded = decodeEventId(eventId);
  const parsed = parseFxPositionSlug(slug ?? "");
  const tail = parsed ? await loadFxPositionTail(parsed.pool, parsed.positionId) : null;
  const event = tail?.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "fx",
    subject: slug,
    canonicalPath: `/ethereum/fx/${slug}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: fxEventHeading(event), timestamp: event.timestamp } : null,
    description: event && parsed ? fxEventPageDescription(parsed.pool, parsed.positionId, event.timestamp) : undefined,
  });
}

// The event page (rails-ops TO-DO-ui-jobs 236): the parent position page's
// server half, same params; its client half (`FxPositionView`) reads
// `eventId` from the route and draws the sub-nav and the event's card in page
// mode with the shared column (`ChainTruthTimeline`'s `eventPage`). `params`
// carries an extra `eventId` key the parent's `Props` does not declare;
// passing the same promise through is structurally valid.
export default async function FxEventPage({ params }: Props) {
  return FxPositionPage({ params });
}
