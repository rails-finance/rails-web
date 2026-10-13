import type { Metadata } from "next";
import { isSparkEvent } from "@/lib/shared/types/event-shape";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { loadSparkPositionTail } from "@/lib/spark/position-page-data";
import { servedFoldersFromParam } from "@/lib/shared/timeline-folder";
import { sparkEventHeading, sparkEventPageDescription } from "@/lib/spark/explorer";
import type { SparkTimelineEvent } from "@/lib/spark/liquidation-fee";
import SparkPositionPage from "../../page";

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
  /** The parent position page reads `?folders=1` off this to choose which
   *  timeline read its tail makes, so this segment has to carry it through. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the route
// renders per request over a `no-store` backend read, same as the parent.
export const dynamic = "force-dynamic";

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadSparkPositionTail` is the same `cache()`-wrapped read the parent page
// and its own opengraph-image already call, so finding the event here costs
// no second backend round trip within one request.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  const decoded = decodeEventId(eventId);
  // The same test the page below decides on, so both reach the same
  // `cache()` entry and the request still makes ONE timeline read. A grouped
  // answer names only the ungrouped events, so an event inside a folder falls
  // back to the generic metadata.
  const sp = await searchParams;
  const grouped = servedFoldersFromParam(sp.folders);
  const tail = await loadSparkPositionTail(wallet, grouped);
  const event = tail.events?.find((e) => e.id === decoded) ?? null;
  const siblings = event
    ? (tail.events?.filter((e) => e.txHash === event.txHash && isSparkEvent(e)) as SparkTimelineEvent[])
    : undefined;
  return eventMetadata({
    session: "spark",
    subject: wallet,
    canonicalPath: `/ethereum/spark/${wallet}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: sparkEventHeading(event, siblings), timestamp: event.timestamp } : null,
    description: event ? sparkEventPageDescription(wallet, event.timestamp) : undefined,
  });
}

// The event page (rails-ops TO-DO-ui-jobs 236): the parent position page's
// server half, same params; its client half (`SparkPositionDetail`) reads
// `eventId` from the route and draws the sub-nav and the event's card in page
// mode with the shared column (`ChainTruthTimeline`'s `eventPage`). The card
// reads the position's history, so the read is the parent's.
export default async function SparkEventPage({ params, searchParams }: Props) {
  return SparkPositionPage({ params, searchParams });
}
