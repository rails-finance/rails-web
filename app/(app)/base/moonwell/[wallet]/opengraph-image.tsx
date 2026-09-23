// This account's live share card — a second consumer of `loadMoonwellBaseHead`,
// the exact same server read the page itself awaits (see `page.tsx` beside
// this file). No new read path.

import { loadMoonwellBaseHead } from "@/lib/moonwell-base/position-page-data";
import { moonwellBaseShareCardModel } from "@/lib/moonwell-base/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This account's live Moonwell Base position card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: raw } = await params;
  const wallet = raw.toLowerCase();
  return positionImage({
    session: "moonwell-base",
    load: async () => {
      if (!ADDRESS.test(raw)) return null;
      const { position } = await loadMoonwellBaseHead(wallet);
      return moonwellBaseShareCardModel(position, wallet);
    },
  });
}
