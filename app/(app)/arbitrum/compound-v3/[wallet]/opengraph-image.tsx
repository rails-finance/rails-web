// This account's live share card — the same server read the page awaits
// (`loadCompoundArbitrumTail`, see `page.tsx` beside this file).

import { loadCompoundArbitrumTail } from "@/lib/compound-arbitrum/position-page-data";
import { compoundBaseShareCardModel } from "@/lib/compound-base/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This account's live Compound V3 on Arbitrum position card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: raw } = await params;
  const wallet = raw.toLowerCase();
  return positionImage({
    session: "compound-v3-arbitrum",
    load: async () => {
      if (!ADDRESS.test(raw)) return null;
      const tail = await loadCompoundArbitrumTail(wallet);
      return compoundBaseShareCardModel(tail.head, wallet, "compound-v3-arbitrum");
    },
  });
}
