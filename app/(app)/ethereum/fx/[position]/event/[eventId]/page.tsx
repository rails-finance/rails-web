import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { parseFxPositionSlug } from "@/lib/fx/asset-catalog";
import { loadFxPositionTail } from "@/lib/fx/position-page-data";
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
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
  });
}

// THIN: renders the exact same parent position page, same params — the
// nested `event/[eventId]` segment sits inside the same `[position]` layout,
// so every provider still wraps it, and `FxPositionView` (this page's client
// half) never learns a new prop. It finds out it is on an event route from
// `useParams().eventId` itself, inside `ChainTruthTimeline` — see that
// component's pinned-mode branch. `params` here carries an extra `eventId`
// key the parent's own `Props` type doesn't declare; passing the same promise
// through is still structurally valid (the parent only reads `position` off
// it).
export default async function FxEventPage({ params }: Props) {
  return FxPositionPage({ params });
}
