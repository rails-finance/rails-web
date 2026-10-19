import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { morphoEventPageDescription, morphoEventPageTitle } from "@/lib/morpho/explorer";
import { loadMorphoArbitrumTail } from "@/lib/morpho-arbitrum/position-page-data";
import { isMorphoArbitrumMarketSegment } from "@/lib/morpho-arbitrum/routes";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import { isMorphoEvent } from "@/lib/shared/types/event-shape";
import type { MorphoChainTimelineResponse } from "@/lib/api/fetch-morpho-base-timeline";
import MorphoArbitrumPositionPage from "../../page";

interface Props {
  params: Promise<{ wallet: string; market: string; eventId: string }>;
}

export const dynamic = "force-dynamic";

/** The event inside this market's own group, from the same cached read the
 *  parent page makes; a history the server did not read leaves the event-less
 *  title. */
async function findEvent(wallet: string, market: string, decodedId: string) {
  const tail = await loadMorphoArbitrumTail(wallet);
  if (!tail.timeline) return null;
  const rehydrated = rehydrateChainTimelineWire(tail.timeline) as MorphoChainTimelineResponse;
  const pos = rehydrated.positions?.find((p) => p.marketId.toLowerCase() === market);
  return pos?.events.filter(isMorphoEvent).find((e) => e.id === decodedId) ?? null;
}

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet: rawWallet, market: rawMarket, eventId } = await params;
  const wallet = rawWallet.toLowerCase();
  const market = rawMarket?.toLowerCase();
  const decoded = decodeEventId(eventId);
  const event =
    ADDRESS.test(rawWallet) && isMorphoArbitrumMarketSegment(market) ? await findEvent(wallet, market, decoded) : null;
  return eventMetadata({
    session: "morpho-arbitrum",
    subject: wallet,
    market: `${(market ?? rawMarket).slice(0, 10)}…`,
    canonicalPath: `/arbitrum/morpho/${wallet}/${market ?? rawMarket}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: morphoEventPageTitle(event), timestamp: event.timestamp } : null,
    description: event ? morphoEventPageDescription("arbitrum", wallet, event.timestamp) : undefined,
  });
}

// The parent position page, same params; its client half reads `eventId`
// from the route and draws the event's card in page mode.
export default async function MorphoArbitrumEventPage({ params }: Props) {
  return MorphoArbitrumPositionPage({ params });
}
