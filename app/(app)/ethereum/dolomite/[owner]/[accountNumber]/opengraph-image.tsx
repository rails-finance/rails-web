// This account's live share card — a second consumer of
// `loadDolomitePositionTail`, the exact same server read the page itself
// awaits (see `page.tsx` beside this file). No new read path.

import { normalizeAccountNumber } from "@/lib/dolomite/asset-catalog";
import { loadDolomitePositionTail } from "@/lib/dolomite/position-page-data";
import { dolomiteShareCardModel } from "@/lib/dolomite/share-card";
import { positionImage } from "@/lib/share/position-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This account's live Dolomite position card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ owner: string; accountNumber: string }>;
}

export default async function Image({ params }: Props) {
  const { owner: rawOwner, accountNumber: rawAccount } = await params;
  return positionImage({
    session: "dolomite",
    load: async () => {
      if (!ADDRESS.test(rawOwner)) return null;
      // Canonical decimal form — the URL accepts decimal or 0x-hex; the API
      // speaks decimal strings. NEVER Number(): uint256, hash-derived past 2^53.
      const accountNumber = normalizeAccountNumber(rawAccount);
      if (accountNumber == null) return null;
      const owner = rawOwner.toLowerCase();
      const tail = await loadDolomitePositionTail(owner, accountNumber);
      // Same composite truncation the page's own heading states — the
      // address-only `shortSubject` helper doesn't fire on a two-part id.
      const shortOwner = `${rawOwner.slice(0, 6)}…${rawOwner.slice(-4)}`;
      const acct = rawAccount.length > 12 ? `${rawAccount.slice(0, 8)}…` : rawAccount;
      return dolomiteShareCardModel(tail.position, `${shortOwner} #${acct}`);
    },
  });
}
