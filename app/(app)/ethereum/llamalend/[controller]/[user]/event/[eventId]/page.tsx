import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { normalizeAddressParam } from "@/lib/llamalend/asset-catalog";
import { loadLlamalendPositionTail } from "@/lib/llamalend/position-page-data";
import { llamalendEventHeading, llamalendEventPageDescription } from "@/lib/llamalend/explorer";
import LlamalendPositionPage from "../../page";

interface Props {
  params: Promise<{ controller: string; user: string; eventId: string }>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the route
// renders per request over a `no-store` backend read, same as the parent.
export const dynamic = "force-dynamic";

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadLlamalendPositionTail` is the same `cache()`-wrapped read the parent
// page and its own opengraph-image already call, so finding the event here
// costs no second backend round trip within one request.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { controller: rawController, user: rawUser, eventId } = await params;
  const decoded = decodeEventId(eventId);
  const controller = normalizeAddressParam(rawController ?? "");
  const user = normalizeAddressParam(rawUser ?? "");
  const tail = controller && user ? await loadLlamalendPositionTail(controller, user) : null;
  const event = tail?.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "llamalend",
    subject: rawUser,
    canonicalPath: `/ethereum/llamalend/${rawController}/${rawUser}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: llamalendEventHeading(event), timestamp: event.timestamp } : null,
    description: event && user ? llamalendEventPageDescription(event, user) : undefined,
  });
}

// The event page (rails-ops TO-DO-ui-jobs 236): the parent position page's
// server half, same params; its client half (`LlamalendPositionView`) reads
// `eventId` from the route and draws the sub-nav and the event's card in page
// mode with the shared column (`ChainTruthTimeline`'s `eventPage`).
export default async function LlamalendEventPage({ params }: Props) {
  return LlamalendPositionPage({ params });
}
