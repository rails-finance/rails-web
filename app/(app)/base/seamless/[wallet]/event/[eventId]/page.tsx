import type { Metadata } from "next";
import { eventMetadata, decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { loadSeamlessTail } from "@/lib/seamless/position-page-data";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import type { ChainTimelineResponse } from "@/lib/api/fetch-chain-timeline";
import SeamlessPositionPage from "../../page";

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the route
// renders per request over a `no-store` backend read, same as the parent.
export const dynamic = "force-dynamic";

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadSeamlessTail` is the same `cache()`-wrapped read the parent page and
// its own opengraph-image already call, so finding the event here costs no
// second backend round trip within one request. `tail.timeline` is present
// only when the index vouched for the whole life (see
// lib/shared/swept-position-page-data.ts) — a wallet whose history has to be
// swept has no server-side event to name here, so this falls back to the
// event-less title rather than sweeping the Pool's own logs inside a metadata
// read.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  const decoded = decodeEventId(eventId);
  const tail = await loadSeamlessTail(wallet);
  const rehydrated = tail.timeline ? (rehydrateChainTimelineWire(tail.timeline) as ChainTimelineResponse) : null;
  const event = rehydrated?.events.filter(isAaveV3Event).find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "seamless",
    subject: shortSubject(wallet),
    canonicalPath: `/base/seamless/${wallet}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
  });
}

// THIN: renders the exact same parent position page, same params — the
// nested `event/[eventId]` segment sits inside the same `[wallet]` layout, so
// every provider still wraps it, and `SeamlessPositionView` (this page's
// client half) never learns a new prop. It finds out it is on an event route
// from `useParams().eventId` itself, inside `ChainTruthTimeline` — see that
// component's pinned-mode branch. `params` here carries an extra `eventId`
// key the parent's own `Props` type doesn't declare; passing the same
// promise through is still structurally valid (the parent only reads
// `wallet` off it).
export default async function SeamlessEventPage({ params }: Props) {
  return SeamlessPositionPage({ params });
}
