// sBOLD on Rails (rails-ops ui-jobs 749): the ERC-4626 vault that deposits
// BOLD into Liquity V2's three Stability Pools. Decision 0014 parks
// third-party vaults; this one is Miles's exception.

import { walletProtocolHref } from "@/lib/wallet/wallet-filters";
import { getKnownInfrastructure } from "@/lib/shared/known-infrastructure";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export const SBOLD_VAULT = "0x50bd66d59911f5e086ec87ae43c811e0d059dd11";

/** BOLD, the vault's ERC-4626 asset (18 decimals). */
export const SBOLD_ASSET = { address: "0x6440f144b7e50d6a8439336510312d2f54beb01d", symbol: "BOLD", decimals: 18 };

/** The block the vault's code first appears in. */
export const SBOLD_CREATED_BLOCK = 22_639_160;

/** The vault's page, where a search for sBOLD lands: under /ethereum/vaults,
 *  no explorer's product (ui-jobs 765); /ethereum/liquity-v2/sbold redirects
 *  here (next.config.ts). */
export const SBOLD_PAGE_PATH = "/ethereum/vaults/sbold";

/** One address's holding, under the vault's page (ui-jobs 765). */
export const sboldHolderHref = (holder: string) => `${SBOLD_PAGE_PATH}/${encodeURIComponent(holder)}`;

/** sBOLD's name (the known-infrastructure registry's, decision 0053) and page
 *  where it is the Stability Pool depositor, for the wallet pill's vault slot
 *  (ui-jobs 765); null for any other address. */
export const sboldDepositorVault = (depositor: string): { name: string; href: string; kind: string } | null => {
  const entry = depositor.toLowerCase() === SBOLD_VAULT ? getKnownInfrastructure(SBOLD_VAULT, MAINNET_CHAIN_ID) : null;
  return entry ? { name: entry.name, href: SBOLD_PAGE_PATH, kind: "an ERC-4626 vault" } : null;
};

/** The vault's deposits on its wallet page, Liquity V2 chosen (ui-jobs 738). */
export const SBOLD_DEPOSITS_HREF = walletProtocolHref(SBOLD_VAULT, "liquity-v2");
