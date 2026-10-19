import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { servedFoldersFromParam } from "@/lib/shared/timeline-folder";
import { morphoEventPageDescription, morphoEventPageTitle } from "@/lib/morpho/explorer";
import { loadMorphoPositionTail } from "@/lib/morpho/position-page-data";
import MorphoPositionPage from "../../page";

interface Props {
  params: Promise<{ positionId: string; eventId: string }>;
  /** The parent position page reads `?folders=` off this to choose which
   *  timeline read its tail makes, so this segment carries it through. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { positionId, eventId } = await params;
  const decoded = decodeEventId(eventId);
  const user = positionId.slice(positionId.indexOf("-") + 1);
  // The same test the page decides on, so both reach one `cache()` entry. A
  // grouped answer names only the ungrouped events, so an event inside a
  // folder falls back to the generic metadata.
  const grouped = servedFoldersFromParam((await searchParams).folders);
  const tail = POSITION_ID.test(positionId) ? await loadMorphoPositionTail(positionId, grouped) : null;
  const event = tail?.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "morpho",
    subject: user,
    canonicalPath: `/ethereum/morpho/${positionId}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: morphoEventPageTitle(event), timestamp: event.timestamp } : null,
    description: event ? morphoEventPageDescription("ethereum", user, event.timestamp) : undefined,
  });
}

// The event page (rails-ops TO-DO-ui-jobs 236): the parent position page's
// server half, same params; its client half (`MorphoPositionView`) reads
// `eventId` from the route and draws the sub-nav and the event's card in page
// mode with the shared column (`ChainTruthTimeline`'s `eventPage`). The card
// reads the position's history, so the read is the parent's.
export default async function MorphoEventPage({ params, searchParams }: Props) {
  return MorphoPositionPage({ params, searchParams });
}
