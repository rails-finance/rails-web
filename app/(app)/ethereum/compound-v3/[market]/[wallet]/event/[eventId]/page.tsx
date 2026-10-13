import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { servedFoldersFromParam } from "@/lib/shared/timeline-folder";
import { marketOf } from "@/lib/compound/asset-catalog";
import { loadCompoundPositionTail } from "@/lib/compound/position-page-data";
import { compoundEventHeading, compoundEventPageDescription } from "@/lib/compound/explorer";
import CompoundPositionPage from "../../page";

interface Props {
  params: Promise<{ market: string; wallet: string; eventId: string }>;
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
// `loadCompoundPositionTail` is the same `cache()`-wrapped read the parent
// page and its own opengraph-image already call, so finding the event here
// costs no second backend round trip within one request.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { market: rawMarket, wallet: rawWallet, eventId } = await params;
  const wallet = rawWallet.toLowerCase();
  const market = rawMarket.toLowerCase();
  const decoded = decodeEventId(eventId);
  // The same test the page decides on, so both reach one `cache()` entry. A
  // grouped answer names only the ungrouped events, so an event inside a
  // folder falls back to the generic metadata.
  const grouped = servedFoldersFromParam((await searchParams).folders);
  const tail = await loadCompoundPositionTail(wallet, market, grouped);
  const event = tail.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "compound",
    subject: wallet,
    market: marketOf(market).baseSymbol,
    canonicalPath: `/ethereum/compound-v3/${market}/${wallet}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: compoundEventHeading(event, "ethereum"), timestamp: event.timestamp } : null,
    description: event ? compoundEventPageDescription(event, wallet, "ethereum") : undefined,
  });
}

// The event page (rails-ops TO-DO-ui-jobs 236): the parent position page's
// server half, same params; its client half (`CompoundPositionView`) reads
// `eventId` from the route and draws the sub-nav and the event's card in page
// mode with the shared column (`ChainTruthTimeline`'s `eventPage`).
export default async function CompoundEventPage({ params, searchParams }: Props) {
  return CompoundPositionPage({ params, searchParams });
}
