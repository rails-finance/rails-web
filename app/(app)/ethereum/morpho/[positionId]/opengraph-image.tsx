// This position's live share card — a second consumer of
// `loadMorphoPositionTail`, the exact same server read the page itself
// awaits (see `page.tsx` beside this file). No new read path.

import { loadMorphoPositionTail } from "@/lib/morpho/position-page-data";
import { morphoShareCardModel } from "@/lib/morpho/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This position's live Morpho Blue position card";

// Mirrors the page's own gate: a Morpho position is keyed (market, user), and
// the market half's `0x` is optional — the backend's own `positionId` writes
// it bare.
const POSITION_ID = /^(0x)?[a-fA-F0-9]{64}-0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ positionId: string }>;
}

export default async function Image({ params }: Props) {
  const { positionId } = await params;
  return positionImage({
    session: "morpho",
    load: async () => {
      if (!POSITION_ID.test(positionId)) return null;
      const tail = await loadMorphoPositionTail(positionId);
      return morphoShareCardModel(tail.position, positionId);
    },
  });
}
