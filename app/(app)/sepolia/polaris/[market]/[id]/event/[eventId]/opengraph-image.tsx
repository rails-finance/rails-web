// This event's immutable share card — reads the SAME server tail the CDP
// page's own `opengraph-image.tsx` reads (`loadPolarisPositionTail`, cached
// per request), finds this id in it, and maps it with the family-agnostic
// `eventCardModel`. No new read path, no per-family card model.
//
// Unlike the position card beside it, NO market board read rides on an
// event card: the position's image reads `loadPolarisMarketsFromChain()` for
// its live ratio stat, but an event is immutable and carries no live figure,
// so it must not touch the board — one fewer chain call per scrape, and a
// stale board can never blank an event image.
//
// The found-immutable / not-found-short cache split lives in `eventImage`,
// not here: a found event is cached for a year, `immutable`; a miss (a
// fabricated id, an index not yet caught up) serves the explorer's static
// roster card on the short cache.

import { normalizeCdpId, normalizeMarket, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { loadPolarisPositionTail } from "@/lib/polaris/position-page-data";
import { decodeEventId } from "@/lib/shared/page-metadata";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Polaris share card";

interface Props {
  params: Promise<{ market: string; id: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { market: rawMarket, id: rawId, eventId } = await params;
  return eventImage({
    session: "polaris",
    load: async () => {
      // The page's own gate, applied here BEFORE the tail is read: a
      // malformed market or a non-numeric id must cost zero outbound
      // requests (scripts/verify/verify-share-abuse.mjs holds the census).
      const market = normalizeMarket(rawMarket);
      const id = normalizeCdpId(rawId);
      if (!market || !id) return null;
      const decoded = decodeEventId(eventId);
      const tail = await loadPolarisPositionTail(market, id);
      const event = tail.events?.find((e) => e.id === decoded);
      if (!event) return null;
      return eventCardModel(event, {
        session: "polaris",
        subject: `#${id}`,
        market: POLARIS_MARKET_CONFIG[market].stable.symbol,
      });
    },
  });
}
