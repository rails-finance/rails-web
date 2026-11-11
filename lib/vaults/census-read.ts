// One vault's census row, for its page's Holders headline (rails-ops ui-jobs
// 407, V2). The census header the rosters read (`fetchVaultPositions` with no
// live overlay), narrowed to this vault. An unanswered census, or a vault it
// has no row for, is null, and the card then states no count.
//
// SERVER-ONLY: the SSR hop signs the request.

import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ssrHop } from "@/lib/shared/listing-ssr";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";

/** `families`: the census's word where the read must name it (Yearn's
 *  "yearn-v3"); a chain-1 read without it answers Aave's three and MetaMorpho. */
export async function loadVaultCensusRow(
  chainId: number,
  vault: string,
  families?: string,
): Promise<VaultCensusRow | null> {
  try {
    const hop = await ssrHop();
    const r = await fetchVaultPositions({ chainId, vault, families, overlay: false, limit: 1, ...hop });
    return r.census.find((c) => c.vault.toLowerCase() === vault.toLowerCase()) ?? null;
  } catch (error) {
    console.error(`The vault census did not answer for ${vault}:`, error);
    return null;
  }
}
