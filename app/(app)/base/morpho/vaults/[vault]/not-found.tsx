// The 404 body for an address the vault-exposure lookup does not serve. The
// status comes from the `(views)` route group beside the explorer's detail
// routes; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";
import { loadMorphoBaseVaultRoster } from "@/lib/morpho-base/vault-roster";
import { baseVaultRosterHref } from "@/lib/vaults/routes";

export default async function MorphoBaseVaultNotFound() {
  const roster = await loadMorphoBaseVaultRoster();
  return (
    <RouteNotFound
      session="morpho-base"
      heading="No vault exposure page for this address"
      backHref={baseVaultRosterHref()}
      backLabel="All vaults on Base"
    >
      The Vaults tab serves every MetaMorpho vault this site has catalogued on Base —{" "}
      {roster.vaults.length.toLocaleString("en-US")} at the last census — and no others. A vault deployed without one of
      the two MetaMorpho factories emits no creation event and is absent from that census; an address missing here may
      still be a vault, it simply has no page.
    </RouteNotFound>
  );
}
