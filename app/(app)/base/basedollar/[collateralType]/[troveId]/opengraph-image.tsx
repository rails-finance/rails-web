// The trove's live share card — a second consumer of `loadBasedollarTroveTail`,
// the exact same server read the page itself awaits (see `page.tsx` beside
// this file). No new read path.

import { resolveBranch } from "@/lib/basedollar/asset-catalog";
import { loadBasedollarTroveTail } from "@/lib/basedollar/trove-page-data";
import { basedollarShareCardModel } from "@/lib/basedollar/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This trove's live Basedollar position card";

// The page's own gate, applied here BEFORE the tail is read: the loader
// rejects an unknown branch, but a trove id that is not a number would still
// reach the backend. A malformed parameter must cost zero outbound requests
// (scripts/verify/verify-share-abuse.mjs holds the census).
const TROVE_ID = /^\d+$/;

interface Props {
  params: Promise<{ collateralType: string; troveId: string }>;
}

export default async function Image({ params }: Props) {
  const { collateralType, troveId } = await params;
  return positionImage({
    session: "basedollar",
    load: async () => {
      if (resolveBranch(collateralType) == null || !TROVE_ID.test(troveId)) return null;
      const tail = await loadBasedollarTroveTail(collateralType, troveId);
      return basedollarShareCardModel(tail, { collateralType, troveId });
    },
  });
}
