// One vault position's share card on Base — the census row, and nothing
// else. It makes NO chain read: `vaultShareCardModel` asks this deployment's
// own listing proxy with `overlay: false`, so an unfurl of a position link
// costs the same as a listing page's own census lane and never a Multicall3
// batch of its own. Every figure it draws is the census's, at the census block,
// which the card states as a stat.

import { vaultShareCardModel } from "@/lib/vaults/share-card";
import { positionImage } from "@/lib/share/position-image";
import { isMorphoBaseRosterVault } from "@/lib/morpho-base/vault-roster";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This address's position in a MetaMorpho vault on Base";

// The page's own gates, applied here BEFORE the census proxy is asked: the
// page serves only the case-study vaults, by the same roster check, and the
// HOLDER must be an address — a typed name is resolved by the page, never by
// an image route (metadata and share cards make no network call of their
// own), and the card matches the census row by address, so a non-address
// holder can draw nothing and must cost nothing
// (scripts/verify/verify-share-abuse.mjs holds the census).
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

interface Props {
  params: Promise<{ vault: string; holder: string }>;
}

export default async function Image({ params }: Props) {
  const { vault, holder } = await params;
  return positionImage({
    // A MetaMorpho vault is Morpho Blue Base's (rails-ops decision 0028), so a
    // render that draws nothing falls back to that explorer's own card.
    session: "morpho-base",
    load: async () => {
      const typed = decodeURIComponent(holder);
      if (!(await isMorphoBaseRosterVault(vault.toLowerCase())) || !ADDRESS.test(typed)) return null;
      return vaultShareCardModel({
        chainId: BASE_CHAIN_ID,
        vault: vault.toLowerCase(),
        holder: typed.toLowerCase(),
        ...(await ssrHop()),
      });
    },
  });
}
