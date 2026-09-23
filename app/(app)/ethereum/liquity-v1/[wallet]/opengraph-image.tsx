// This wallet's live share card — a second consumer of
// `loadLiquityV1PositionTail`, the exact same server read the page itself
// awaits (see `page.tsx` beside this file). No new read path.

import { loadLiquityV1PositionTail } from "@/lib/liquity-v1/position-page-data";
import { liquityV1ShareCardModel } from "@/lib/liquity-v1/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This trove's live Liquity V1 position card";

// A wallet is not a Trove id — an address that never borrowed here is a
// legitimate empty answer (see position-page-data.ts). Only a string that
// cannot be an address is turned away before the read.
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: raw } = await params;
  const wallet = raw.toLowerCase();
  return positionImage({
    session: "liquity-v1",
    load: async () => {
      if (!ADDRESS.test(raw)) return null;
      const tail = await loadLiquityV1PositionTail(wallet);
      return liquityV1ShareCardModel(tail, wallet);
    },
  });
}
