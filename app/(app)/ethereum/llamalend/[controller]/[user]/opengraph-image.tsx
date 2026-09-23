// This position's live share card — a second consumer of
// `loadLlamalendPositionTail`, the exact same server read the page itself
// awaits (see `page.tsx` beside this file). No new read path.

import { normalizeAddressParam } from "@/lib/llamalend/asset-catalog";
import { loadLlamalendPositionTail } from "@/lib/llamalend/position-page-data";
import { llamalendShareCardModel } from "@/lib/llamalend/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This account's live LlamaLend position card";

interface Props {
  params: Promise<{ controller: string; user: string }>;
}

export default async function Image({ params }: Props) {
  const { controller: rawController, user: rawUser } = await params;
  return positionImage({
    session: "llamalend",
    load: async () => {
      const controller = normalizeAddressParam(rawController ?? "");
      const user = normalizeAddressParam(rawUser ?? "");
      if (!controller || !user) return null;
      const tail = await loadLlamalendPositionTail(controller, user);
      return llamalendShareCardModel(tail.position, user);
    },
  });
}
