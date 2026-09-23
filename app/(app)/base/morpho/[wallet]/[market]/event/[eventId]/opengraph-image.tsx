// This event's immutable share card. `loadMorphoBaseTail`'s `timeline` is the
// same lean wire shape the family's /api/chain/morpho-base/timeline route
// sends over HTTP (lib/shared/timeline-wire.ts), seeded only when the index
// can vouch for the whole life (lib/morpho-base/position-page-data.ts — the
// common case since the backfill landed 2026-09-03). A wallet it cannot
// vouch for falls back to the static roster card; there is no chain sweep to
// fall back to inside an image route's budget. No new read path either way.

import { decodeEventId, shortSubject } from "@/lib/shared/page-metadata";
import { loadMorphoBaseTail } from "@/lib/morpho-base/position-page-data";
import { isMorphoBaseMarketSegment } from "@/lib/morpho-base/routes";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import { isMorphoEvent } from "@/lib/shared/types/event-shape";
import type { MorphoChainTimelineResponse } from "@/lib/api/fetch-morpho-base-timeline";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Morpho Blue on Base share card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string; market: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: rawWallet, market: rawMarket, eventId } = await params;
  const wallet = rawWallet.toLowerCase();
  const market = rawMarket?.toLowerCase();
  return eventImage({
    session: "morpho-base",
    load: async () => {
      if (!ADDRESS.test(rawWallet) || !isMorphoBaseMarketSegment(market)) return null;
      const decoded = decodeEventId(eventId);
      const tail = await loadMorphoBaseTail(wallet);
      // No seed — the index could not vouch for this wallet's whole
      // history, so the page's client half sweeps and this card cannot.
      if (!tail.timeline) return null;
      const rehydrated = rehydrateChainTimelineWire(tail.timeline) as MorphoChainTimelineResponse;
      const pos = rehydrated.positions?.find((p) => p.marketId.toLowerCase() === market);
      const event = pos?.events.filter(isMorphoEvent).find((e) => e.id === decoded);
      if (!event) return null;
      return eventCardModel(event, {
        session: "morpho-base",
        subject: shortSubject(wallet),
        market: `${market.slice(0, 10)}…`,
      });
    },
  });
}
