import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { loadMorphoBaseTail } from "@/lib/morpho-base/position-page-data";
import { isMorphoBaseMarketSegment } from "@/lib/morpho-base/routes";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import { isMorphoEvent } from "@/lib/shared/types/event-shape";
import type { MorphoChainTimelineResponse } from "@/lib/api/fetch-morpho-base-timeline";
import MorphoBasePositionPage from "../../page";

interface Props {
  params: Promise<{ wallet: string; market: string; eventId: string }>;
}

// Every figure on the parent route is read at the head, so this segment
// renders per request too.
export const dynamic = "force-dynamic";

/** `loadMorphoBaseTail`'s `timeline` is seeded only when the index can vouch
 *  for the whole life (lib/morpho-base/position-page-data.ts) — the box's
 *  Morpho Base backfill landed 2026-09-03, so that is the common case now. A
 *  wallet the index cannot vouch for (the read cut at the row ceiling, the
 *  box unreachable) gets no seed, this returns "not found" and the reader
 *  falls to the position card alone. Otherwise this rehydrates the same wire
 *  shape the client's fetched response carries and finds the event inside
 *  this market's own group. */
async function findMorphoBaseEvent(wallet: string, market: string, decodedId: string) {
  const tail = await loadMorphoBaseTail(wallet);
  if (!tail.timeline) return null;
  const rehydrated = rehydrateChainTimelineWire(tail.timeline) as MorphoChainTimelineResponse;
  const pos = rehydrated.positions?.find((p) => p.marketId.toLowerCase() === market);
  if (!pos) return null;
  return pos.events.filter(isMorphoEvent).find((e) => e.id === decodedId) ?? null;
}

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet: rawWallet, market: rawMarket, eventId } = await params;
  const wallet = rawWallet.toLowerCase();
  const market = rawMarket?.toLowerCase();
  const decoded = decodeEventId(eventId);
  const event =
    ADDRESS.test(rawWallet) && isMorphoBaseMarketSegment(market)
      ? await findMorphoBaseEvent(wallet, market, decoded)
      : null;
  return eventMetadata({
    session: "morpho-base",
    subject: wallet,
    market: `${(market ?? rawMarket).slice(0, 10)}…`,
    canonicalPath: `/base/morpho/${wallet}/${market ?? rawMarket}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
  });
}

// THIN: renders the exact same parent position page, same params — the
// nested `event/[eventId]` segment sits inside the same `[market]` layout,
// so every provider still wraps it, and `MorphoBasePositionView` (this
// page's client half) never learns a new prop. It finds out it is on an
// event route from `useParams().eventId` itself, inside `ChainTruthTimeline`
// — see that component's pinned-mode branch. `params` here carries an extra
// `eventId` key the parent's own `Props` type doesn't declare; passing the
// same promise through is still structurally valid (the parent only reads
// `wallet`/`market` off it). The parent's own address/market-segment gate
// (`notFound()`) runs unchanged, so a malformed subject 404s the same way
// here.
export default async function MorphoBaseEventPage({ params }: Props) {
  return MorphoBasePositionPage({ params });
}
