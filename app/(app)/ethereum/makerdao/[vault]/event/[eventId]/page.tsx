import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { servedFoldersFromParam } from "@/lib/shared/timeline-folder";
import { loadMakerVaultTail } from "@/lib/makerdao/position-page-data";
import MakerVaultPage from "../../page";

interface Props {
  params: Promise<{ vault: string; eventId: string }>;
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
// `loadMakerVaultTail` is the same read the parent page and its own
// opengraph-image already call, so finding the event here costs no second
// backend round trip within one request.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { vault, eventId } = await params;
  const decoded = decodeEventId(eventId);
  // The same test the page decides on, so both reach one `cache()` entry. A
  // grouped answer names only the ungrouped events, so an event inside a
  // folder falls back to the generic metadata.
  const grouped = servedFoldersFromParam((await searchParams).folders);
  const tail = await loadMakerVaultTail(vault, grouped);
  const event = tail.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "makerdao",
    subject: vault,
    canonicalPath: `/ethereum/makerdao/${vault}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
  });
}

// THIN: renders the exact same parent vault page, same params — the nested
// `event/[eventId]` segment sits inside the same `[vault]` layout, so every
// provider still wraps it, and `MakerVaultDetailView` (this page's client
// half) never learns a new prop. It finds out it is on an event route from
// `useParams().eventId` itself, inside `ChainTruthTimeline` — see that
// component's pinned-mode branch. `params` here carries an extra `eventId`
// key the parent's own `Props` type doesn't declare; passing the same promise
// through is still structurally valid (the parent only reads `vault` off it).
export default async function MakerdaoEventPage({ params, searchParams }: Props) {
  return MakerVaultPage({ params, searchParams });
}
