// This CDP's live share card — a second consumer of `loadPolarisPositionTail`,
// the exact same server read the page itself awaits (see `page.tsx` beside
// this file), plus the market board the listing reads for its ratio, plus the
// CDP's chain read at head (`loadPolarisPositionFromChain`, the loader behind
// the page's /api/chain/polaris/position), from which the card states the
// page's live window. All are server-side loaders called directly: no HTTP hop
// out of this route.

import { normalizeCdpId, normalizeMarket } from "@/lib/polaris/asset-catalog";
import { loadPolarisPositionTail } from "@/lib/polaris/position-page-data";
import { polarisShareCardModel } from "@/lib/polaris/share-card";
import { loadPolarisMarketsFromChain, loadPolarisPositionFromChain } from "@/lib/sources/chain/polaris-position";
import { polarisSinceLastTouch } from "@/lib/polaris/since-last-touch";
import { isPolarisEvent } from "@/lib/shared/types/event-shape";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This CDP's live Polaris position card";

interface Props {
  params: Promise<{ market: string; id: string }>;
}

export default async function Image({ params }: Props) {
  const { market: rawMarket, id: rawId } = await params;
  return positionImage({
    session: "polaris",
    load: async () => {
      const market = normalizeMarket(rawMarket);
      const id = normalizeCdpId(rawId);
      if (!market || !id) return null;
      // The market board rides beside the tail — one multicall per image
      // render, the same read the listing makes, so the card can carry the
      // ratio. It is allowed to fail: a null board drops the ratio stat and
      // the image still renders.
      // The chain read is allowed to fail too: without it there is no live
      // window, and the card carries the indexed summary.
      const [tail, markets, chain] = await Promise.all([
        loadPolarisPositionTail(market, id),
        loadPolarisMarketsFromChain().catch(() => null),
        loadPolarisPositionFromChain(market, id).catch(() => null),
      ]);
      const events = (tail.events ?? []).filter(isPolarisEvent);
      const liveWindow = chain && events.length > 0 ? polarisSinceLastTouch(chain, events) : null;
      return polarisShareCardModel(tail.position, markets, liveWindow);
    },
  });
}
