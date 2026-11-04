// The 404 body for an address a chain's MetaMorpho vault pages do not serve
// (rails-ops ui-jobs 486: one body for Base and Ethereum). The status comes
// from the route; see components/shared/route-not-found.tsx.

import { RouteNotFound } from "@/components/shared/route-not-found";
import { chainMeta } from "@/lib/shared/chains";
import { loadMetaMorphoVaultRoster, type MetaMorphoChainId } from "@/lib/metamorpho/vault-roster";
import { metaMorphoVaultRosterHref } from "@/lib/vaults/routes";
import { metaMorphoSession } from "@/components/vaults/metamorpho-vault-route";

export async function MetaMorphoVaultNotFound({ chainId }: { chainId: MetaMorphoChainId }) {
  const roster = await loadMetaMorphoVaultRoster(chainId);
  const chain = chainMeta(chainId).name;
  return (
    <RouteNotFound
      session={metaMorphoSession(chainId)}
      heading="No vault exposure page for this address"
      backHref={metaMorphoVaultRosterHref(chainId)}
      backLabel={`All vaults on ${chain}`}
    >
      The Vaults tab serves every MetaMorpho vault this site has catalogued on {chain} —{" "}
      {roster.vaults.length.toLocaleString("en-US")} at the last census — and no others. A vault deployed without one of
      the two MetaMorpho factories emits no creation event and is absent from that census; an address missing here may
      still be a vault, it simply has no page.
    </RouteNotFound>
  );
}
