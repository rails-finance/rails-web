import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { loadMorphoPositionTail } from "@/lib/morpho/position-page-data";
import MorphoPositionPage from "../../page";

interface Props {
  params: Promise<{ positionId: string; eventId: string }>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the route
// renders per request over a `no-store` backend read, same as the parent.
export const dynamic = "force-dynamic";

// Mirrors the parent's own gate: a Morpho position is keyed (market, user),
// and the market half's `0x` is optional — the backend's own `positionId`
// writes it bare.
const POSITION_ID = /^(0x)?[a-fA-F0-9]{64}-0x[a-fA-F0-9]{40}$/;

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadMorphoPositionTail` is the same `cache()`-wrapped read the parent page
// and its own opengraph-image already call, so finding the event here costs
// no second backend round trip within one request.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { positionId, eventId } = await params;
  const decoded = decodeEventId(eventId);
  const user = positionId.slice(positionId.indexOf("-") + 1);
  const tail = POSITION_ID.test(positionId) ? await loadMorphoPositionTail(positionId) : null;
  const event = tail?.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "morpho",
    subject: user,
    canonicalPath: `/ethereum/morpho/${positionId}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
  });
}

// THIN: renders the exact same parent position page, same params — the
// nested `event/[eventId]` segment sits inside the same `[positionId]`
// layout, so every provider still wraps it, and `MorphoPositionView` (this
// page's client half) never learns a new prop. It finds out it is on an
// event route from `useParams().eventId` itself, inside `ChainTruthTimeline`
// — see that component's pinned-mode branch. `params` here carries an extra
// `eventId` key the parent's own `Props` type doesn't declare; passing the
// same promise through is still structurally valid (the parent only reads
// `positionId` off it).
export default async function MorphoEventPage({ params }: Props) {
  return MorphoPositionPage({ params });
}
