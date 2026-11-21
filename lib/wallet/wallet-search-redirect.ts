// A listing page's server half (ui-jobs 738): a URL whose search names a whole
// address or an ENS name, on a family whose listings send a wallet search to
// the wallet page (`WALLET_SEARCH_FAMILIES`), redirects to
// /wallet/<address or name>?protocol=<family>, so an old shared link lands
// there. Anything else returns and the listing renders.

import { redirect } from "next/navigation";
import { readListQuery } from "@/lib/shared/list-filter";
import { walletSearchHref } from "@/lib/wallet/wallet-filters";

export function redirectWalletSearch(sp: URLSearchParams, protocol: string): void {
  const href = walletSearchHref(protocol, readListQuery(sp));
  if (href) redirect(href);
}
