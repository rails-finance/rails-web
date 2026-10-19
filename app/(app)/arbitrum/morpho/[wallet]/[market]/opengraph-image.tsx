// This position's live share card — the same server read the page awaits
// (`loadMorphoArbitrumTail`, see `page.tsx` beside this file).

import { loadMorphoArbitrumTail } from "@/lib/morpho-arbitrum/position-page-data";
import { morphoBaseMarketShareCardModel } from "@/lib/morpho-base/share-card";
import { isMorphoArbitrumMarketSegment } from "@/lib/morpho-arbitrum/routes";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This position's live Morpho Blue on Arbitrum position card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string; market: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: rawWallet, market: rawMarket } = await params;
  const wallet = rawWallet.toLowerCase();
  const market = rawMarket?.toLowerCase();
  return positionImage({
    session: "morpho-arbitrum",
    load: async () => {
      if (!ADDRESS.test(rawWallet) || !isMorphoArbitrumMarketSegment(market)) return null;
      const tail = await loadMorphoArbitrumTail(wallet);
      return morphoBaseMarketShareCardModel(tail.head, wallet, market, "morpho-arbitrum");
    },
  });
}
