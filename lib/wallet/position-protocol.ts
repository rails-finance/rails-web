// A wallet position's protocol on the roster, for the positions menu. A row
// with a page resolves from its href; a row with none (href null) resolves
// from its chain and family, as lib/wallet/wallet-summary.ts does.

import { CHAINS } from "@/lib/shared/chains";
import { PROTOCOLS, listingHrefForWallet, protocolForPathname } from "@/lib/shared/protocols";
import type { MenuProtocol, WalletCountsPosition } from "@/lib/wallet/summary-counts";

type Entry = (typeof PROTOCOLS)[number];

export function protocolEntryOf(p: Pick<WalletCountsPosition, "chain" | "family" | "href">): Entry | undefined {
  const byHref = p.href ? protocolForPathname(p.href.split("?")[0]) : undefined;
  if (byHref) return byHref;
  const chainId = Object.values(CHAINS).find((c) => c.slug === p.chain)?.id;
  return PROTOCOLS.find((e) => e.chainId === chainId && e.slug === p.family);
}

/** A position's explorer on the roster: its name, its place, and its listing
 *  searched by the wallet (every wallet family's listing reads `q`). */
export function menuProtocolOf(p: WalletCountsPosition, address: string): MenuProtocol | undefined {
  const entry = protocolEntryOf(p);
  if (!entry) return undefined;
  return { name: entry.label, order: PROTOCOLS.indexOf(entry), listing: listingHrefForWallet(entry.session, address) };
}
