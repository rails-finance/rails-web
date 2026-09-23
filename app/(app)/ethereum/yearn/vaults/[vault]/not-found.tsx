// The 404 body for an address the Yearn V3 catalogue does not hold. The status
// comes from the route itself; see components/shared/route-not-found.tsx for
// why the words arrive in the flight payload rather than in the HTML.
import { RouteNotFound } from "@/components/shared/route-not-found";
import { yearnVaultRosterHref } from "@/lib/vaults/routes";
import { loadYearnVaultRoster } from "@/lib/yearn/vault-roster";

export default async function YearnVaultNotFound() {
  const roster = await loadYearnVaultRoster();
  return (
    <RouteNotFound
      session="yearn"
      heading="No vault page for this address"
      backHref={yearnVaultRosterHref()}
      backLabel="Every Yearn V3 vault"
    >
      This explorer serves the vaults the Yearn V3 factories made, as they stood at block{" "}
      {roster.censusBlock.toLocaleString("en-US")}, and a factory announces each one with a creation event that the
      census sweeps. That roster is a floor: a V3 vault deployed by hand with no factory leaves nothing to sweep, and a
      vault made since that block joins when the census runs again. So an address the census has not seen may well be a
      Yearn vault, and it has no page here.
    </RouteNotFound>
  );
}
