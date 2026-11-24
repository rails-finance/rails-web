// Where Rails shows an IPOR Fusion market at the vault's address (rails-ops
// TO-DO-ipor-scoping §6.3): the covered explorer's listing filtered to the
// vault, or its page per address. Null where no Rails page covers it, and the
// row then says "not covered by Rails".

import { listingHrefForWallet, protocolForSession } from "@/lib/shared/protocols";
import type { SessionProtocol } from "@/lib/shared/sessions";
import type { MarketInfo } from "./markets";

export function marketRailsHref(
  m: Pick<MarketInfo, "covered" | "walletPage">,
  chainId: number,
  vault: string,
): string | null {
  const session = m.covered?.[chainId] as SessionProtocol | undefined;
  if (!session) return null;
  const listing = listingHrefForWallet(session, vault);
  if (listing) return listing;
  const entry = protocolForSession(session);
  return m.walletPage && entry ? `${entry.href}/${vault.toLowerCase()}` : null;
}
