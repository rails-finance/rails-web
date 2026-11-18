// sBOLD on Rails (rails-ops ui-jobs 749): the ERC-4626 vault that deposits
// BOLD into Liquity V2's three Stability Pools. Decision 0014 parks
// third-party vaults; this one is Miles's exception.

import { LIQUITY_V2_SP_PATH } from "./sp-routes";

export const SBOLD_VAULT = "0x50bd66d59911f5e086ec87ae43c811e0d059dd11";

/** Where a search for sBOLD lands: the vault's deposits in the Stability Pool
 *  listing, one row per branch. */
export const SBOLD_HREF = `${LIQUITY_V2_SP_PATH}?q=${SBOLD_VAULT}`;
