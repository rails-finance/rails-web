// This position's live share card — a second consumer of
// `loadFxPositionTail`, the exact same server read the page itself awaits
// (see `page.tsx` beside this file). No new read path.

import { parseFxPositionSlug } from "@/lib/fx/asset-catalog";
import { loadFxPositionTail } from "@/lib/fx/position-page-data";
import { fxShareCardModel } from "@/lib/fx/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This position's live f(x) Protocol position card";

interface Props {
  params: Promise<{ position: string }>;
}

export default async function Image({ params }: Props) {
  const { position: slug } = await params;
  return positionImage({
    session: "fx",
    load: async () => {
      const parsed = parseFxPositionSlug(slug ?? "");
      if (!parsed) return null;
      const tail = await loadFxPositionTail(parsed.pool, parsed.positionId);
      return fxShareCardModel(tail.position, slug);
    },
  });
}
