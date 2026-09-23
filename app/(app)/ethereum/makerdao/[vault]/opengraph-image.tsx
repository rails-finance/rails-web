// This vault's live share card — a second consumer of `loadMakerVaultTail`,
// the exact same server read the page itself awaits (see `page.tsx` beside
// this file). No new read path.

import { loadMakerVaultTail } from "@/lib/makerdao/position-page-data";
import { makerShareCardModel } from "@/lib/makerdao/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This vault's live MakerDAO position card";

// The [vault] param is a cdp id (decimal) or a urn ADDRESS for LockStake
// engine urns (decision 0013) — the same gate the page itself applies before
// reading. A string that is neither names nothing.
const CDP_ID = /^\d{1,20}$/;
const URN_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

interface Props {
  params: Promise<{ vault: string }>;
}

export default async function Image({ params }: Props) {
  const { vault } = await params;
  return positionImage({
    session: "makerdao",
    load: async () => {
      if (!CDP_ID.test(vault) && !URN_ADDRESS.test(vault)) return null;
      const tail = await loadMakerVaultTail(vault);
      return makerShareCardModel(tail, vault);
    },
  });
}
