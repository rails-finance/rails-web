// This account's live share card — a second consumer of
// `loadAaveV3PositionTail`, the exact same server read the page itself awaits
// (see `page.tsx` beside this file). No new read path.

import { asV3Market } from "@/lib/aave-v3/asset-catalog";
import { loadAaveV3PositionTail } from "@/lib/aave-v3/position-page-data";
import { aaveV3ShareCardModel } from "@/lib/aave-v3/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This account's live Aave V3 position card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: raw } = await params;
  const wallet = raw.toLowerCase();
  return positionImage({
    session: "aave-v3",
    load: async () => {
      if (!ADDRESS.test(raw)) return null;
      // Core is what a plain `/ethereum/aave-v3/<wallet>` link means — an
      // unfurl carries no query string, so `?market=` (the page's own way to
      // ask for Prime/EtherFi) never reaches a crawler.
      const tail = await loadAaveV3PositionTail(wallet, asV3Market(null));
      return aaveV3ShareCardModel(tail.position, wallet);
    },
  });
}
