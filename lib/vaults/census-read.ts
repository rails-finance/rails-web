// One vault's census row, for its page's Holders headline (rails-ops ui-jobs
// 407, V2). The census header the rosters read (`fetchVaultPositions` with no
// live overlay), narrowed to this vault. An unanswered census, or a vault it
// has no row for, is null, and the card then states no count.
//
// SERVER-ONLY: the SSR hop signs the request.

import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ssrHop } from "@/lib/shared/listing-ssr";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";

export async function loadVaultCensusRow(chainId: number, vault: string): Promise<VaultCensusRow | null> {
  try {
    const hop = await ssrHop();
    const r = await fetchVaultPositions({ chainId, vault, overlay: false, limit: 1, ...hop });
    return r.census.find((c) => c.vault.toLowerCase() === vault.toLowerCase()) ?? null;
  } catch (error) {
    console.error(`The vault census did not answer for ${vault}:`, error);
    return null;
  }
}
