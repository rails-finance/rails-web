// This vault event's immutable share card, on Base.
// ----------------------------------------------------------------------------
// It makes NO CHAIN READ, the same promise the position card beside it makes:
// the event comes out of the STORED TAIL through this deployment's own proxy,
// the vault's own name and share symbol out of the static catalogue (which
// carries the `name()`/`symbol()` the census read), and the ASSET's symbol out
// of the census row — the catalogue bakes the asset's ADDRESS, since that is
// the field `asset()` makes immutable, and an address is not a unit to print.
// See `lib/vaults/event-share-card.ts` for why an image route must not run the
// timeline's own sweeps, and for the two cases that answer null and fall back
// to the static card on the SHORT cache.

import { decodeEventId } from "@/lib/shared/page-metadata";
import { eventImage } from "@/lib/share/event-image";
import { vaultEventCardModel, vaultUnitsFromCensus } from "@/lib/vaults/event-share-card";
import { morphoBaseRosterEntry } from "@/lib/morpho-base/vault-roster";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import { MORPHO_BASE_VAULT_TAIL_VERSION } from "@/lib/shared/vault-holder-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "One event from this address's history in a MetaMorpho vault on Base";

// The page's own gates, applied BEFORE the proxy is asked: the page serves only
// the case-study vaults, by the same roster check, and the HOLDER must be an
// address — a typed name is resolved by the page, never by an image route, and
// the tail is keyed by address. So a malformed parameter costs zero outbound
// requests (scripts/verify/verify-share-abuse.mjs holds the census).
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

interface Props {
  params: Promise<{ vault: string; holder: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { vault, holder, eventId } = await params;
  return eventImage({
    // A MetaMorpho vault is Morpho Blue Base's (rails-ops decision 0028), so a
    // render that draws nothing falls back to that explorer's own card.
    session: "morpho-base",
    load: async () => {
      const address = vault.toLowerCase();
      const who = holder.toLowerCase();
      const entry = await morphoBaseRosterEntry(address);
      if (!entry || !ADDRESS.test(who)) return null;
      const hop = await ssrHop();
      const census = await vaultUnitsFromCensus({ chainId: BASE_CHAIN_ID, vault: address, holder: who, ...hop });
      return vaultEventCardModel({
        session: "morpho-base",
        chainId: BASE_CHAIN_ID,
        vault: address,
        holder: who,
        eventId: decodeEventId(eventId),
        loaderVersion: MORPHO_BASE_VAULT_TAIL_VERSION,
        ...hop,
        // The catalogue's `symbol()` first — it is the same read the census
        // made, kept where no request is needed to have it.
        shareSymbol: entry?.symbol ?? census.shareSymbol,
        assetSymbol: census.assetSymbol,
        assetAddress: census.assetAddress ?? entry?.asset,
      });
    },
  });
}
