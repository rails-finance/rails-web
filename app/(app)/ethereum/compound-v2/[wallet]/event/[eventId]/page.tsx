import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { loadCompoundV2PositionTail } from "@/lib/compound-v2/position-page-data";
import CompoundV2PositionPage from "../../page";

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the route
// renders per request over a `no-store` backend read, same as the parent.
export const dynamic = "force-dynamic";

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadCompoundV2PositionTail` is the same `cache()`-wrapped read the parent
// page and its own opengraph-image already call, so finding the event here
// costs no second backend round trip within one request.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  const decoded = decodeEventId(eventId);
  const tail = await loadCompoundV2PositionTail(wallet);
  const event = tail.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "compound-v2",
    subject: wallet,
    canonicalPath: `/ethereum/compound-v2/${wallet}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
  });
}

// THIN: renders the exact same parent position page, same params — the
// nested `event/[eventId]` segment sits inside the same `[wallet]` layout, so
// every provider still wraps it, and `CompoundV2PositionView` (this page's
// client half) never learns a new prop. It finds out it is on an event route
// from `useParams().eventId` itself, inside `ChainTruthTimeline` — see that
// component's pinned-mode branch. `params` here carries an extra `eventId`
// key the parent's own `Props` type doesn't declare; passing the same promise
// through is still structurally valid (the parent only reads `wallet` off it).
export default async function CompoundV2EventPage({ params }: Props) {
  return CompoundV2PositionPage({ params });
}
