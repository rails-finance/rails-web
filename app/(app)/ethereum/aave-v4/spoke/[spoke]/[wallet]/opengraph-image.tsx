// This account's live share card — a second consumer of `loadAaveV4SpokeTail`,
// the exact same server read the page itself awaits (see `page.tsx` beside
// this file). No new read path.

import { spokeFromSlug } from "@/lib/aave-v4/spoke-meta";
import { loadAaveV4SpokeTail } from "@/lib/aave-v4/spoke-position-page-data";
import { aaveV4SpokeShareCardModel } from "@/lib/aave-v4/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This account's live Aave V4 position card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ spoke: string; wallet: string }>;
}

export default async function Image({ params }: Props) {
  const { spoke: rawSpoke, wallet: rawWallet } = await params;
  const wallet = rawWallet.toLowerCase();
  return positionImage({
    session: "aave-v4",
    load: async () => {
      if (!ADDRESS.test(rawWallet)) return null;
      const spokeName = spokeFromSlug(rawSpoke) ?? decodeURIComponent(rawSpoke);
      const tail = await loadAaveV4SpokeTail(wallet, spokeName);
      return aaveV4SpokeShareCardModel(tail, wallet, {
        spokeName,
        market: spokeFromSlug(rawSpoke) ?? rawSpoke,
      });
    },
  });
}
