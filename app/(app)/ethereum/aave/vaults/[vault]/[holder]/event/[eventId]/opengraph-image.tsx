// This vault event's immutable share card.
// ----------------------------------------------------------------------------
// It makes NO CHAIN READ, the same promise the position card beside it makes:
// the event comes out of the STORED TAIL through this deployment's own proxy,
// and the units out of the census row the position card already reads. Two
// proxy reads, no `eth_getLogs`, no archive call — see
// `lib/vaults/event-share-card.ts` for why an image route must not run the
// timeline's own sweeps, and for the two cases (an event above the tail's cut,
// a position with no tail yet) that answer null and fall back to the static
// card on the SHORT cache.

import { decodeEventId } from "@/lib/shared/page-metadata";
import { eventImage } from "@/lib/share/event-image";
import { vaultEventCardModel, vaultUnitsFromCensus } from "@/lib/vaults/event-share-card";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { AAVE_VAULT_TAIL_VERSION } from "@/lib/shared/vault-holder-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "One event from this address's history in an Aave vault on Ethereum";

// The page's own gates, applied BEFORE either proxy is asked: both the vault
// and the HOLDER must be addresses — a typed name is resolved by the page,
// never by an image route, and the tail is keyed by address — so a malformed
// parameter costs zero outbound requests (scripts/verify/verify-share-abuse.mjs
// holds the census).
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

interface Props {
  params: Promise<{ vault: string; holder: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { vault, holder, eventId } = await params;
  return eventImage({
    // A vault is the protocol's whose factory deployed it (rails-ops decision
    // 0028), so a render that draws nothing falls back to Aave's own card.
    session: "aave-vaults",
    load: async () => {
      const address = vault.toLowerCase();
      const who = holder.toLowerCase();
      if (!ADDRESS.test(address) || !ADDRESS.test(who)) return null;
      const hop = await ssrHop();
      const units = await vaultUnitsFromCensus({ chainId: MAINNET_CHAIN_ID, vault: address, holder: who, ...hop });
      return vaultEventCardModel({
        session: "aave-vaults",
        chainId: MAINNET_CHAIN_ID,
        vault: address,
        holder: who,
        eventId: decodeEventId(eventId),
        loaderVersion: AAVE_VAULT_TAIL_VERSION,
        ...hop,
        ...units,
      });
    },
  });
}
