import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { loadSparkPositionTail } from "@/lib/spark/position-page-data";
import { servedFoldersFromParam } from "@/lib/shared/timeline-folder";
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
  return eventMetadata({
    session: "spark",
    subject: wallet,
    canonicalPath: `/ethereum/spark/${wallet}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
  });
}

// THIN: renders the exact same parent position page, same params — the
// nested `event/[eventId]` segment sits inside the same `[wallet]` layout, so
// every provider still wraps it, and `SparkPositionDetail` (this page's
// client half) never learns a new prop. It finds out it is on an event route
// from `useParams().eventId` itself, inside `ChainTruthTimeline` — see that
// component's pinned-mode branch. `params` here carries an extra `eventId`
// key the parent's own `Props` type doesn't declare; passing the same
// promise through is still structurally valid (the parent only reads
// `wallet` off it, and `?folders=1` off `searchParams`).
export default async function SparkEventPage({ params, searchParams }: Props) {
  return SparkPositionPage({ params, searchParams });
}
