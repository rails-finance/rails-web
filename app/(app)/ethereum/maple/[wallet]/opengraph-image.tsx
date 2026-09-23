// This account's live share card — a second consumer of
// `loadMaplePositionTail`, the exact same server read the page itself awaits
// (see `page.tsx` beside this file). No new read path.

import { getCcipEscrow } from "@/lib/shared/known-infrastructure";
import { loadMaplePositionTail } from "@/lib/maple/position-page-data";
import { mapleShareCardModel } from "@/lib/maple/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This account's live Maple position card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: raw } = await params;
  const wallet = raw.toLowerCase();
  return positionImage({
    session: "maple",
    load: async () => {
      if (!ADDRESS.test(raw)) return null;
      // The CCIP bridge escrows are not lenders — the backend holds no roster
      // row for them, and the page renders a custody view instead. Mirrors
      // the page's own gate exactly.
      if (getCcipEscrow(wallet)) return null;
      const tail = await loadMaplePositionTail(wallet);
      return mapleShareCardModel(tail.position, wallet);
    },
  });
}
