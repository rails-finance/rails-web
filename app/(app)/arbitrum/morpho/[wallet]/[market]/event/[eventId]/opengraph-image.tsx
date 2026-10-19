// This event's immutable share card, from the history the page's server read
// seeds (`loadMorphoArbitrumTail`); a history the store did not answer falls
// back to the static roster card.

import { decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { loadMorphoArbitrumTail } from "@/lib/morpho-arbitrum/position-page-data";
import { isMorphoArbitrumMarketSegment } from "@/lib/morpho-arbitrum/routes";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import { isMorphoEvent } from "@/lib/shared/types/event-shape";
import type { MorphoChainTimelineResponse } from "@/lib/api/fetch-morpho-base-timeline";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Morpho Blue on Arbitrum share card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string; market: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: rawWallet, market: rawMarket, eventId } = await params;
  const wallet = rawWallet.toLowerCase();
  const market = rawMarket?.toLowerCase();
  return eventImage({
    session: "morpho-arbitrum",
    load: async () => {
      if (!ADDRESS.test(rawWallet) || !isMorphoArbitrumMarketSegment(market)) return null;
      const decoded = decodeEventId(eventId);
      const tail = await loadMorphoArbitrumTail(wallet);
      if (!tail.timeline) return null;
      const rehydrated = rehydrateChainTimelineWire(tail.timeline) as MorphoChainTimelineResponse;
      const pos = rehydrated.positions?.find((p) => p.marketId.toLowerCase() === market);
      const event = pos?.events.filter(isMorphoEvent).find((e) => e.id === decoded);
      if (!event) return null;
      return eventCardModel(event, {
        session: "morpho-arbitrum",
        subject: shortSubject(wallet),
        market: `${market.slice(0, 10)}…`,
      });
    },
  });
}
