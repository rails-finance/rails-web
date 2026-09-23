// This position's live share card — a second consumer of
// `loadFrankencoinPositionTail`, the exact same server read the page itself
// awaits (see `page.tsx` beside this file). No new read path.

import { normalizePositionAddress } from "@/lib/frankencoin/asset-catalog";
import { loadFrankencoinPositionTail } from "@/lib/frankencoin/position-page-data";
import { frankencoinShareCardModel } from "@/lib/frankencoin/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This position's live Frankencoin position card";

interface Props {
  params: Promise<{ position: string }>;
}

export default async function Image({ params }: Props) {
  const { position: raw } = await params;
  return positionImage({
    session: "frankencoin",
    load: async () => {
      const position = normalizePositionAddress(raw ?? "");
      if (!position) return null;
      const tail = await loadFrankencoinPositionTail(position);
      return frankencoinShareCardModel(tail.position);
    },
  });
}
