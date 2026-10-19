// This account's live share card — the same server read the page awaits
// (`loadAaveV3ArbitrumTail`, see `page.tsx` beside this file).

import { loadAaveV3ArbitrumTail } from "@/lib/aave-v3-arbitrum/position-page-data";
import { aaveV3ArbitrumShareCardModel } from "@/lib/aave-v3-arbitrum/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This account's live Aave V3 on Arbitrum position card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: raw } = await params;
  const wallet = raw.toLowerCase();
  return positionImage({
    session: "aave-v3-arbitrum",
    load: async () => {
      if (!ADDRESS.test(raw)) return null;
      const tail = await loadAaveV3ArbitrumTail(wallet);
      return aaveV3ArbitrumShareCardModel(tail, wallet);
    },
  });
}
