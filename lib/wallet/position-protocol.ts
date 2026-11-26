// A wallet position's protocol on the roster, for the positions menu. A row
// with a page resolves from its href; a row with none (href null) resolves
// from its chain and family, as lib/wallet/wallet-summary.ts does.

import { CHAINS } from "@/lib/shared/chains";
import { POSITION_NOUN, PROTOCOLS, listingHrefForWallet, protocolForPathname } from "@/lib/shared/protocols";
import { positionCrumb, positionName } from "@/lib/shared/position-name";
import {
  VAULT_SHARES_FAMILY,
  vaultProtocolOfHref,
  type MenuProtocol,
  type WalletCountsPosition,
} from "@/lib/wallet/summary-counts";
import { walletProtocol, walletProtocolHref } from "@/lib/wallet/wallet-filters";

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

/** A position's explorer on the roster: its name, its place, and the page of
 *  the wallet's positions in it: the wallet view narrowed to the protocol
 *  where the view reads it (Miles, 25 Nov 2026), else its listing searched by
 *  the wallet. A vault-share row names its vault protocol and opens the
 *  holder listing of the explorer's Vaults tab, where it has one; Yearn V3
 *  has none, so its row opens the wallet view narrowed to the vault shares. */
export function menuProtocolOf(p: WalletCountsPosition, address: string): MenuProtocol | undefined {
  const entry = protocolEntryOf(p);
  if (!entry) return undefined;
  const vault = vaultProtocolOfHref(p.href);
  return {
    name: vault ?? entry.label,
    order: PROTOCOLS.indexOf(entry),
    listing: vault
      ? (listingHrefForWallet(entry.session, address, "vaults") ?? walletProtocolHref(address, VAULT_SHARES_FAMILY))
      : walletProtocol(p.family)
        ? walletProtocolHref(address, p.family)
        : listingHrefForWallet(entry.session, address),
  };
}

/** A summary row's name in the positions menu (H13.2; ui-jobs 856): the
 *  trail's crumb (`positionCrumb`) from the row's market, the family's noun
 *  and the id its `positionId` holds besides the market. An id that holds
 *  the wallet ("0x…:core", "0x…-1", "<vault>-0x…") is the wallet's. */
export function summaryCrumb(p: WalletCountsPosition, wallet: string): string {
  const w = wallet.toLowerCase();
  const entry = protocolEntryOf(p);
  const noun = entry ? POSITION_NOUN[entry.session] : "Position";
  const market = p.market?.toLowerCase();
  const parts = p.positionId.split(":").filter((x) => x.toLowerCase() !== market);
  const raw = parts.find((x) => x.toLowerCase().includes(w)) ?? parts[parts.length - 1] ?? p.positionId;
  const id = raw.toLowerCase().includes(w) ? w : raw;
  const chain = Object.values(CHAINS).find((c) => c.slug === p.chain)?.name;
  return positionCrumb(positionName({ market: p.market, noun, id }), w, chain);
}
