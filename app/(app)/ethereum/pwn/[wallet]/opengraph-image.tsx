// This wallet's live share card — a second consumer of
// `loadPwnPositionTail`, the exact same server read the page itself awaits
// (see `page.tsx` beside this file). No new read path.
//
// The route's `?loan=` search param is not available here — Next's image
// file convention hands its handler only `{ params }` — so the card always
// states the wallet's most recently created loan, the page's own default for
// a link without `?loan=` (see share-card.ts's header comment).

import { loadPwnPositionTail } from "@/lib/pwn/position-page-data";
import { pwnShareCardModel } from "@/lib/pwn/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This wallet's live PWN loan card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ wallet: string }>;
}

export default async function Image({ params }: Props) {
  const { wallet: raw } = await params;
  const wallet = raw.toLowerCase();
  return positionImage({
    session: "pwn",
    load: async () => {
      if (!ADDRESS.test(raw)) return null;
      const tail = await loadPwnPositionTail(wallet);
      return pwnShareCardModel(tail.summaries, wallet);
    },
  });
}
