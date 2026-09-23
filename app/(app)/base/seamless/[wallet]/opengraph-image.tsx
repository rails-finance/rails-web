// This account's live share card — a second consumer of `loadSeamlessTail`,
// the exact same server read the page itself awaits (see `page.tsx` beside
// this file). No new read path.

import { loadSeamlessTail } from "@/lib/seamless/position-page-data";
import { seamlessShareCardModel } from "@/lib/seamless/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This account's live Seamless position card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: raw } = await params;
  const wallet = raw.toLowerCase();
  return positionImage({
    session: "seamless",
    load: async () => {
      if (!ADDRESS.test(raw)) return null;
      const tail = await loadSeamlessTail(wallet);
      return seamlessShareCardModel(tail, wallet);
    },
  });
}
