// The trove's live share card — a second consumer of `loadEbisuTroveTail`,
// the exact same server read the page itself awaits (see `page.tsx` beside
// this file). No new read path.

import { resolveBranch } from "@/lib/ebisu/asset-catalog";
import { loadEbisuTroveTail } from "@/lib/ebisu/trove-page-data";
import { ebisuShareCardModel } from "@/lib/ebisu/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This trove's live Ebisu position card";

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
    session: "ebisu",
    load: async () => {
      if (resolveBranch(collateralType) == null || !TROVE_ID.test(troveId)) return null;
      const tail = await loadEbisuTroveTail(collateralType, troveId);
      return ebisuShareCardModel(tail, { collateralType, troveId });
    },
  });
}
