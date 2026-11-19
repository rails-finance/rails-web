// The 404 body for an address the IPOR Fusion census does not hold. The status
// comes from the route; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";
import { iporFusionVaultRosterHref } from "@/lib/vaults/routes";
import { iporFusionRoster } from "@/lib/ipor-fusion/vault-roster";

export default function IporFusionVaultNotFound() {
  const roster = iporFusionRoster(1);
  return (
    <RouteNotFound
      session="ipor-fusion"
      heading="No vault page for this address"
      backHref={iporFusionVaultRosterHref(1)!}
      backLabel="Every IPOR Fusion vault"
    >
      This explorer serves the vaults the IPOR Fusion factory made, as they stood at block{" "}
      {roster.censusBlock.toLocaleString("en-US")}, each one announced by a creation event the census sweeps. That
      roster is a floor: a vault deployed by hand or by an earlier factory leaves nothing to sweep, and a vault made
      since that block joins when the census runs again. So an address the census has not seen may well be an IPOR
      Fusion vault, and it has no page here.
    </RouteNotFound>
  );
}
