// This event's share card — the same server read the position page makes
// (`loadAaveV3ArbitrumTail`), the event found in it and mapped by the
// family-agnostic `eventCardModel`. A history the server did not read draws
// the static roster card.

import { loadAaveV3ArbitrumTail } from "@/lib/aave-v3-arbitrum/position-page-data";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import { decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";
import type { ChainTimelineResponse } from "@/lib/api/fetch-chain-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Aave V3 on Arbitrum share card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: raw, eventId } = await params;
  const wallet = raw.toLowerCase();
  return eventImage({
    session: "aave-v3-arbitrum",
    load: async () => {
      if (!ADDRESS.test(raw)) return null;
      const decoded = decodeEventId(eventId);
      const tail = await loadAaveV3ArbitrumTail(wallet);
      if (!tail.timeline) return null;
      const rehydrated = rehydrateChainTimelineWire(tail.timeline) as ChainTimelineResponse;
      const event = rehydrated.events.filter(isAaveV3Event).find((e) => e.id === decoded);
      if (!event) return null;
      return eventCardModel(event, { session: "aave-v3-arbitrum", subject: shortSubject(wallet) });
    },
  });
}
