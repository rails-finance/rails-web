// sBOLD on Rails (rails-ops ui-jobs 749): the ERC-4626 vault that deposits
// BOLD into Liquity V2's three Stability Pools. Decision 0014 parks
// third-party vaults; this one is Miles's exception.

import { LIQUITY_V2_BASE_PATH, LIQUITY_V2_SP_PATH } from "./sp-routes";

export const SBOLD_VAULT = "0x50bd66d59911f5e086ec87ae43c811e0d059dd11";

/** BOLD, the vault's ERC-4626 asset (18 decimals). */
export const SBOLD_ASSET = { address: "0x6440f144b7e50d6a8439336510312d2f54beb01d", symbol: "BOLD", decimals: 18 };

/** The block the vault's code first appears in. */
export const SBOLD_CREATED_BLOCK = 22_639_160;

/** The vault's page. */
export const SBOLD_PAGE_PATH = `${LIQUITY_V2_BASE_PATH}/sbold`;

/** Where a search for sBOLD lands: the vault's deposits in the Stability Pool
 *  listing, one row per branch. */
export const SBOLD_HREF = `${LIQUITY_V2_SP_PATH}?q=${SBOLD_VAULT}`;
