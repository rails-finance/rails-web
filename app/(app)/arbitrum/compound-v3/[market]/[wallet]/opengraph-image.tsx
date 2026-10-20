// This position's live share card — the same server read the page awaits
// (`loadCompoundArbitrumTail`, see `page.tsx` beside this file), held to the
// Comet the URL names and labelled with it.

import { loadCompoundArbitrumTail } from "@/lib/compound-arbitrum/position-page-data";
import { compoundArbitrumMarketOf } from "@/lib/compound-arbitrum/asset-catalog";
import { compoundBaseShareCardModel } from "@/lib/compound-base/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This account's live Compound V3 on Arbitrum position card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ market: string; wallet: string }>;
}

export default async function Image({ params }: Props) {
  const { market: rawMarket, wallet: raw } = await params;
  const wallet = raw.toLowerCase();
  const market = compoundArbitrumMarketOf(rawMarket);
  return positionImage({
    session: "compound-v3-arbitrum",
    load: async () => {
      if (!market || !ADDRESS.test(raw)) return null;
      const tail = await loadCompoundArbitrumTail(wallet);
      if (!tail.head) return null;
      const positions = tail.head.positions.filter((p) => p.market === market.key);
      const model = compoundBaseShareCardModel(
        { ...tail.head, positions, positionsFound: positions.length },
        wallet,
        "compound-v3-arbitrum",
      );
      return model ? { ...model, market: market.label } : null;
    },
  });
}
