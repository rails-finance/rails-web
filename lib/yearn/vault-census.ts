// The position census's header for Yearn V3 on Ethereum: one row per vault,
// no live overlay, read by the roster (its Holders figure) and the vaults info
// page (the census block). SERVER-ONLY.

import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

/** The census rows; an unanswered census is no rows, and the figures that rest
 *  on it are left out. */
export async function loadYearnCensus(): Promise<VaultCensusRow[]> {
  try {
    const hop = await ssrHop();
    const r = await fetchVaultPositions({
      chainId: MAINNET_CHAIN_ID,
      families: "yearn-v3",
      overlay: false,
      limit: 1,
      ...hop,
    });
    return r.census;
  } catch (error) {
    console.error("The vault census did not answer for Yearn V3:", error);
    return [];
  }
}
