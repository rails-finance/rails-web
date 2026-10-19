import type { Metadata } from "next";
import { eventMetadata, decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { loadCompoundBaseTail } from "@/lib/compound-base/position-page-data";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import { isCompoundEvent } from "@/lib/shared/types/event-shape";
import type { CometChainTimelineResult } from "@/lib/sources/chain/compound-v3-events";
import { compoundEventPageDescription, compoundEventTabWords } from "@/lib/compound/explorer";
import CompoundBaseWalletPage from "../../page";

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the route
// renders per request over a `no-store` backend read, same as the parent.
export const dynamic = "force-dynamic";

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadCompoundBaseTail` is the same `cache()`-wrapped read the parent page
// and its own opengraph-image already call, so finding the event here costs
// no second backend round trip within one request. `tail.timeline` is
// present only when the index vouched for the whole life (see
// lib/shared/swept-position-page-data.ts) — a wallet whose history has to be
// swept has no server-side event to name here, so this falls back to the
// event-less title rather than sweeping the Comets' own logs inside a
// metadata read.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  const decoded = decodeEventId(eventId);
  const tail = await loadCompoundBaseTail(wallet);
  const rehydrated = tail.timeline ? (rehydrateChainTimelineWire(tail.timeline) as CometChainTimelineResult) : null;
  const event = rehydrated?.events.filter(isCompoundEvent).find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "compound-base",
    subject: shortSubject(wallet),
    canonicalPath: `/base/compound-v3/${wallet}/event/${encodeURIComponent(decoded)}`,
    event: event
      ? { actionLabel: compoundEventTabWords(event, "base", rehydrated?.events ?? []), timestamp: event.timestamp }
      : null,
    description: event ? compoundEventPageDescription(event, wallet, "base") : undefined,
  });
}

// The event page (rails-ops TO-DO-ui-jobs 236): the parent position page's
// server half, same params; its client half (`CompoundBaseWalletView`) reads
// `eventId` from the route and draws the sub-nav and the event's card in page
// mode with the shared column (`ChainTruthTimeline`'s `eventPage`).
export default async function CompoundBaseEventPage({ params }: Props) {
  // A pinned event page stays flat (rails-ops decision 0019, leg C note): a
  // grouped answer serves a folder's members only when it is opened, and the
  // pinned card must be among the served events.
  return CompoundBaseWalletPage({ params, searchParams: Promise.resolve({ folders: "0" }) });
}
