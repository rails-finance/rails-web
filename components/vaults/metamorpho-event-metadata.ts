// One MetaMorpho event page's metadata, on Base or Ethereum (rails-ops ui-jobs
// 236, 486). It reads the STORED TAIL alone, never the chain, and the vault's
// name comes out of the roster, which holds the `name()` the census read: no
// call is made for either. The tail is the same one the event route's
// `opengraph-image.tsx` reads, so a link's title and its card agree about what
// was found.
//
// SERVER-ONLY.

import type { Metadata } from "next";

import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { vaultEventPageDescription } from "@/lib/vaults/explorer";
import { findVaultTailEvent } from "@/lib/vaults/event-share-card";
import { metaMorphoVaultHref } from "@/lib/vaults/routes";
import { MORPHO_BASE_VAULT_TAIL_VERSION, KIND_LABEL } from "@/lib/shared/vault-holder-timeline";
import { metaMorphoRosterEntry, type MetaMorphoChainId } from "@/lib/metamorpho/vault-roster";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { metaMorphoSession } from "@/components/vaults/metamorpho-vault-route";

export interface MetaMorphoEventParams {
  params: Promise<{ vault: string; holder: string; eventId: string }>;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function metaMorphoEventMetadata(
  chainId: MetaMorphoChainId,
  { params }: MetaMorphoEventParams,
): Promise<Metadata> {
  const { vault, holder, eventId } = await params;
  const address = vault.toLowerCase();
  const who = holder.toLowerCase();
  const decoded = decodeEventId(eventId);
  const session = metaMorphoSession(chainId);
  // A typed name — an ENS name or a Basename — is resolved by the page, on the
  // server, never by metadata; the tail is keyed by address, so a name finds
  // no event here and the title falls back to the position's own.
  const event = ADDRESS.test(who)
    ? await findVaultTailEvent({
        chainId,
        vault: address,
        holder: who,
        eventId: decoded,
        loaderVersion: MORPHO_BASE_VAULT_TAIL_VERSION,
        ...(await ssrHop()),
      })
    : null;
  const vaultName = (await metaMorphoRosterEntry(chainId, address))?.name;
  return eventMetadata({
    session,
    subject: ADDRESS.test(who) ? who : decodeURIComponent(holder),
    market: vaultName,
    canonicalPath: `${metaMorphoVaultHref(chainId, address, holder)}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: KIND_LABEL[event.kind], timestamp: event.timestamp } : null,
    description: event
      ? vaultEventPageDescription(
          session,
          chainId === 1 ? "ethereum" : "base",
          vaultName ?? null,
          address,
          who,
          event.timestamp,
        )
      : undefined,
  });
}
