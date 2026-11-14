// The bad-debt episodes in the steward's record (V14.1; rails-ops ui-jobs 554,
// piece C), read on the server by lib/vaults/bad-debt-episodes.ts. The
// MetaMorpho vault route streams it, behind a separate Suspense boundary, into
// the steward's record under the vaults table.
//
// SERVER-ONLY: the reads use the RPC keys and RAILS_API_URL.

import { VaultBadDebtEpisodes } from "@/components/vaults/vault-bad-debt-episodes";
import { loadBadDebtEpisodes } from "@/lib/vaults/bad-debt-episodes";

export async function VaultBadDebtSection({ chainId, vault }: { chainId: number; vault: string }) {
  return <VaultBadDebtEpisodes read={await loadBadDebtEpisodes(chainId, vault)} />;
}
