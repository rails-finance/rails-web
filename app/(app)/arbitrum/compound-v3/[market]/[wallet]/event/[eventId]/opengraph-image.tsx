// This event's share card — the same server read the market page makes
// (`loadCompoundArbitrumTail`), the event found in it and mapped by the
// family-agnostic `eventCardModel`. A history the server did not read draws
// the static roster card.

import { loadCompoundArbitrumTail } from "@/lib/compound-arbitrum/position-page-data";
import { compoundArbitrumMarketOf } from "@/lib/compound-arbitrum/asset-catalog";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import { isCompoundEvent } from "@/lib/shared/types/event-shape";
import { decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";
import type { CometChainTimelineResult } from "@/lib/sources/chain/compound-v3-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Compound V3 on Arbitrum share card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ market: string; wallet: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { market: rawMarket, wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  const market = compoundArbitrumMarketOf(rawMarket);
  return eventImage({
    session: "compound-v3-arbitrum",
    load: async () => {
      if (!market || !ADDRESS.test(raw)) return null;
      const decoded = decodeEventId(eventId);
      const tail = await loadCompoundArbitrumTail(wallet);
      if (!tail.timeline) return null;
      const rehydrated = rehydrateChainTimelineWire(tail.timeline) as CometChainTimelineResult;
      const event = rehydrated.events.filter(isCompoundEvent).find((e) => e.id === decoded);
      if (!event || event.context.data.market !== market.key) return null;
      return eventCardModel(event, {
        session: "compound-v3-arbitrum",
        subject: shortSubject(wallet),
        market: market.label,
      });
    },
  });
}
