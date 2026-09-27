// This account's live share card — the Ethereum spoke page's own
// opengraph-image.tsx (`app/(app)/ethereum/aave-v4/spoke/[spoke]/[wallet]/
// opengraph-image.tsx`), pointed at Base: `loadAaveV4SpokeTail` reads
// `/api/aave-v4-base` (AAVE_V4_BASE_API_ROOT) and the card model states
// session "aave-v4-base" so a failed render falls back to this row's own
// static card (`public/og/explore-aave-v4-base.png`), not the Ethereum one.

import { spokeFromSlug } from "@/lib/aave-v4/spoke-meta";
import { loadAaveV4SpokeTail } from "@/lib/aave-v4/spoke-position-page-data";
import { AAVE_V4_BASE_API_ROOT } from "@/lib/aave-v4/deployment-routes";
import { aaveV4BaseSpokeShareCardModel } from "@/lib/aave-v4-base/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This account's live Aave V4 Base position card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ spoke: string; wallet: string }>;
}

export default async function Image({ params }: Props) {
  const { spoke: rawSpoke, wallet: rawWallet } = await params;
  const wallet = rawWallet.toLowerCase();
  return positionImage({
    session: "aave-v4-base",
    load: async () => {
      if (!ADDRESS.test(rawWallet)) return null;
      const spokeName = spokeFromSlug(rawSpoke) ?? decodeURIComponent(rawSpoke);
      const tail = await loadAaveV4SpokeTail(wallet, spokeName, AAVE_V4_BASE_API_ROOT);
      return aaveV4BaseSpokeShareCardModel(tail, wallet, {
        spokeName,
        market: spokeFromSlug(rawSpoke) ?? rawSpoke,
      });
    },
  });
}
