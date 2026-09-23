// This CDP's live share card — a second consumer of `loadPolarisPositionTail`,
// the exact same server read the page itself awaits (see `page.tsx` beside
// this file), plus the market board the listing reads for its ratio. Both are
// server-side loaders called directly: no HTTP hop out of this route.

import { normalizeCdpId, normalizeMarket } from "@/lib/polaris/asset-catalog";
import { loadPolarisPositionTail } from "@/lib/polaris/position-page-data";
import { polarisShareCardModel } from "@/lib/polaris/share-card";
import { loadPolarisMarketsFromChain } from "@/lib/sources/chain/polaris-position";
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
      const [tail, markets] = await Promise.all([
        loadPolarisPositionTail(market, id),
        loadPolarisMarketsFromChain().catch(() => null),
      ]);
      return polarisShareCardModel(tail.position, markets);
    },
  });
}
