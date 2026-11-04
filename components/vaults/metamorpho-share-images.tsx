// The MetaMorpho holding's and event's share cards, on Base or Ethereum
// (rails-ops ui-jobs 486). Each chain's opengraph-image.tsx calls one of these
// with its chain fixed.
// ----------------------------------------------------------------------------
// NO CHAIN READ in either. The holding card is the census row, asked of this
// deployment's own listing proxy with `overlay: false`; the event card is the
// event out of the STORED TAIL, the vault's name and share symbol out of the
// roster, and the asset's symbol out of the census row. See
// lib/vaults/share-card.ts and lib/vaults/event-share-card.ts.
//
// The page's own gates are applied BEFORE the proxy is asked: the vault must be
// in the chain's roster, and the HOLDER must be an address — a typed name is
// resolved by the page, never by an image route, and the census and the tail are
// keyed by address. So a malformed parameter costs zero outbound requests
// (scripts/verify/verify-share-abuse.mjs holds the census).
//
// SERVER-ONLY.

import { vaultShareCardModel } from "@/lib/vaults/share-card";
import { positionImage } from "@/lib/share/position-image";
import { decodeEventId } from "@/lib/shared/page-metadata";
import { eventImage } from "@/lib/share/event-image";
import { vaultEventCardModel, vaultUnitsFromCensus } from "@/lib/vaults/event-share-card";
import { metaMorphoRosterEntry, type MetaMorphoChainId } from "@/lib/metamorpho/vault-roster";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { MORPHO_BASE_VAULT_TAIL_VERSION } from "@/lib/shared/vault-holder-timeline";
import { metaMorphoSession } from "@/components/vaults/metamorpho-vault-route";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function metaMorphoHoldingImage(
  chainId: MetaMorphoChainId,
  { params }: { params: Promise<{ vault: string; holder: string }> },
) {
  const { vault, holder } = await params;
  return positionImage({
    // A MetaMorpho vault is its chain's Morpho Blue explorer's (rails-ops
    // decision 0028), so a render that draws nothing falls back to that
    // explorer's own card.
    session: metaMorphoSession(chainId),
    load: async () => {
      const typed = decodeURIComponent(holder);
      if (!(await metaMorphoRosterEntry(chainId, vault.toLowerCase())) || !ADDRESS.test(typed)) return null;
      return vaultShareCardModel({
        chainId,
        vault: vault.toLowerCase(),
        holder: typed.toLowerCase(),
        ...(await ssrHop()),
      });
    },
  });
}

export async function metaMorphoEventImage(
  chainId: MetaMorphoChainId,
  { params }: { params: Promise<{ vault: string; holder: string; eventId: string }> },
) {
  const session = metaMorphoSession(chainId);
  const { vault, holder, eventId } = await params;
  return eventImage({
    session,
    load: async () => {
      const address = vault.toLowerCase();
      const who = holder.toLowerCase();
      const entry = await metaMorphoRosterEntry(chainId, address);
      if (!entry || !ADDRESS.test(who)) return null;
      const hop = await ssrHop();
      const census = await vaultUnitsFromCensus({ chainId, vault: address, holder: who, ...hop });
      return vaultEventCardModel({
        session,
        chainId,
        vault: address,
        holder: who,
        eventId: decodeEventId(eventId),
        loaderVersion: MORPHO_BASE_VAULT_TAIL_VERSION,
        ...hop,
        // The roster's `symbol()` first — the same read the census made, kept
        // where no request is needed to have it.
        shareSymbol: entry.symbol || census.shareSymbol,
        assetSymbol: census.assetSymbol,
        assetAddress: census.assetAddress ?? entry.asset,
      });
    },
  });
}
