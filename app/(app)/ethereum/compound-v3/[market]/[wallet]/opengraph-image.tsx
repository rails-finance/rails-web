// This account's live share card — a second consumer of
// `loadCompoundPositionTail`, the exact same server read the page itself
// awaits (see `page.tsx` beside this file). No new read path.

import { loadCompoundPositionTail } from "@/lib/compound/position-page-data";
import { compoundShareCardModel } from "@/lib/compound/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This account's live Compound V3 position card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ market: string; wallet: string }>;
}

export default async function Image({ params }: Props) {
  const { market: rawMarket, wallet: rawWallet } = await params;
  const wallet = rawWallet.toLowerCase();
  const market = rawMarket.toLowerCase();
  return positionImage({
    session: "compound",
    load: async () => {
      if (!ADDRESS.test(rawWallet)) return null;
      const tail = await loadCompoundPositionTail(wallet, market);
      return compoundShareCardModel(tail.position, { wallet, market });
    },
  });
}
