import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { loadFluidPositionTail } from "@/lib/fluid/position-page-data";
import FluidPositionPage from "../../page";

interface Props {
  params: Promise<{ nft: string; eventId: string }>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the route
// renders per request over a `no-store` backend read, same as the parent.
export const dynamic = "force-dynamic";

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadFluidPositionTail` is the same `cache()`-wrapped read the parent page
// and its own opengraph-image already call, so finding the event here costs
// no second backend round trip within one request.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { nft, eventId } = await params;
  const decoded = decodeEventId(eventId);
  const tail = await loadFluidPositionTail(nft);
  const event = tail.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "fluid",
    subject: `#${nft}`,
    canonicalPath: `/ethereum/fluid/${nft}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
  });
}

// THIN: renders the exact same parent position page, same params — the
// nested `event/[eventId]` segment sits inside the same `[nft]` layout, so
// every provider still wraps it, and `FluidPositionView` (this page's client
// half) never learns a new prop. It finds out it is on an event route from
// `useParams().eventId` itself, inside `ChainTruthTimeline` — see that
// component's pinned-mode branch. `params` here carries an extra `eventId`
// key the parent's own `Props` type doesn't declare; passing the same promise
// through is still structurally valid (the parent only reads `nft` off it).
export default async function FluidEventPage({ params }: Props) {
  return FluidPositionPage({ params });
}
