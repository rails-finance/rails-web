import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { servedFoldersFromParam } from "@/lib/shared/timeline-folder";
import { getCcipEscrow } from "@/lib/shared/known-infrastructure";
import { loadMaplePositionTail } from "@/lib/maple/position-page-data";
import { mapleEventPageDescription, mapleEventPageTitle } from "@/lib/maple/explorer";
import MaplePositionPage from "../../page";

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
  /** The parent position page reads `?folders=` off this to choose which
   *  timeline read its tail makes, so this segment carries it through. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the route
// renders per request over a `no-store` backend read, same as the parent.
export const dynamic = "force-dynamic";

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadMaplePositionTail` is the same `cache()`-wrapped read the parent page
// and its own opengraph-image already call, so finding the event here costs
// no second backend round trip within one request.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  const decoded = decodeEventId(eventId);
  // The CCIP bridge escrows carry no roster row and no timeline — mirrors the
  // page's own gate exactly, so an escrow's event link states no event rather
  // than throwing on a read that would return nothing anyway.
  // The same test the page decides on, so both reach one `cache()` entry. A
  // grouped answer names only the ungrouped events, so an event inside a
  // folder falls back to the generic metadata.
  const grouped = servedFoldersFromParam((await searchParams).folders);
  const tail = getCcipEscrow(wallet) ? null : await loadMaplePositionTail(wallet, grouped);
  const event = tail?.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "maple",
    subject: wallet,
    canonicalPath: `/ethereum/maple/${wallet}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: mapleEventPageTitle(event), timestamp: event.timestamp } : null,
    description: event ? mapleEventPageDescription(wallet, event.timestamp) : undefined,
  });
}

// The event page (rails-ops TO-DO-ui-jobs 236): the parent position page's
// server half, same params; its client half (`MaplePositionView`) reads
// `eventId` from the route and draws the sub-nav and the event's card in page
// mode with the shared column (`ChainTruthTimeline`'s `eventPage`).
export default async function MapleEventPage({ params, searchParams }: Props) {
  return MaplePositionPage({ params, searchParams });
}
