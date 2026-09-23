// The 404 body for an address Aave's own catalogue does not name. The status
// comes from the route itself; see components/shared/route-not-found.tsx for
// why the words arrive in the flight payload rather than in the HTML.
import { RouteNotFound } from "@/components/shared/route-not-found";
import { ethereumVaultsListingHref } from "@/lib/vaults/routes";

export default function AaveEthereumVaultNotFound() {
  return (
    <RouteNotFound
      session="aave-v3"
      heading="No vault page for this address"
      backHref={ethereumVaultsListingHref()}
      backLabel="All vaults on Ethereum"
    >
      This section serves the vaults Aave itself publishes on Ethereum, and the catalogue is Aave&rsquo;s own address
      book plus two enumerators it names — <code>StataTokenFactory.getStataTokens()</code> and{" "}
      <code>Umbrella.getStkTokens()</code>, both asked at the block a page reads at. That list is complete at its block
      by construction, so an Aave-shaped ERC-4626 outside it is not a vault this section knows: it may well be a vault,
      and it has no page here.
    </RouteNotFound>
  );
}
