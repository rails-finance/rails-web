// This position's live share card — a second consumer of
// `loadFluidPositionTail`, the exact same server read the page itself awaits
// (see `page.tsx` beside this file). No new read path.

import { loadFluidPositionTail } from "@/lib/fluid/position-page-data";
import { fluidShareCardModel } from "@/lib/fluid/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This position's live Fluid position card";

// A Fluid position is an ERC-721: its id is a decimal integer, same gate the
// page itself applies.
const NFT_ID = /^\d{1,20}$/;

interface Props {
  params: Promise<{ nft: string }>;
}

export default async function Image({ params }: Props) {
  const { nft } = await params;
  return positionImage({
    session: "fluid",
    load: async () => {
      if (!NFT_ID.test(nft)) return null;
      const tail = await loadFluidPositionTail(nft);
      return fluidShareCardModel(tail.position, nft);
    },
  });
}
