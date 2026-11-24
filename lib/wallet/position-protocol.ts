// A wallet position's protocol on the roster, for the positions menu. A row
// with a page resolves from its href; a row with none (href null) resolves
// from its chain and family, as lib/wallet/wallet-summary.ts does.

import { CHAINS } from "@/lib/shared/chains";
import { PROTOCOLS, listingHrefForWallet, protocolForPathname } from "@/lib/shared/protocols";
import {
  VAULT_SHARES_FAMILY,
  vaultProtocolOfHref,
  type MenuProtocol,
  type WalletCountsPosition,
} from "@/lib/wallet/summary-counts";
import { walletProtocolHref } from "@/lib/wallet/wallet-filters";

type Entry = (typeof PROTOCOLS)[number];

export function protocolEntryOf(p: Pick<WalletCountsPosition, "chain" | "family" | "href">): Entry | undefined {
  const byHref = p.href ? protocolForPathname(p.href.split("?")[0]) : undefined;
  if (byHref) return byHref;
  const chainId = Object.values(CHAINS).find((c) => c.slug === p.chain)?.id;
  return PROTOCOLS.find((e) => e.chainId === chainId && e.slug === p.family);
}

/** The protocol a position's row names: a vault-share row its vault
 *  protocol ("MetaMorpho vaults" under Morpho's door), any other its
 *  explorer's label, else its family. */
export function protocolLabelOf(p: Pick<WalletCountsPosition, "chain" | "family" | "href">): string {
  return vaultProtocolOfHref(p.href) ?? protocolEntryOf(p)?.label ?? p.family;
}

/** A position's explorer on the roster: its name, its place, and its listing
 *  searched by the wallet (every wallet family's listing reads `q`). A
 *  vault-share row names its vault protocol and opens the holder listing of
 *  the explorer's Vaults tab, where it has one; Yearn V3 has none, so its row
 *  opens the wallet view narrowed to the vault shares. */
export function menuProtocolOf(p: WalletCountsPosition, address: string): MenuProtocol | undefined {
  const entry = protocolEntryOf(p);
  if (!entry) return undefined;
  const vault = vaultProtocolOfHref(p.href);
  return {
    name: vault ?? entry.label,
    order: PROTOCOLS.indexOf(entry),
    listing: vault
      ? (listingHrefForWallet(entry.session, address, "vaults") ?? walletProtocolHref(address, VAULT_SHARES_FAMILY))
      : listingHrefForWallet(entry.session, address),
  };
}
