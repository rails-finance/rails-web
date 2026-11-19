// focus: the explorer's explainer; the shell's gate stands over the explorer
// How the IPOR Fusion roster is built — /ethereum/ipor-fusion/vaults/info.
// No chain read: every sentence is about the rules the roster and the
// factsheets follow; the counts come from the census.

import { VaultsInfoPage } from "@/components/vaults/vaults-info-page";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { protocolForHref } from "@/lib/shared/protocols";
import { iporFusionRoster } from "@/lib/ipor-fusion/vault-roster";

export const metadata = listingMetadata({
  title: "About the IPOR Fusion vault roster",
  canonicalPath: "/ethereum/ipor-fusion/vaults/info",
  description:
    "How Rails builds the IPOR Fusion roster: every vault the factory made, the creation event that enumerates them, the roles over each vault, and why totals stay in each vault's asset.",
});

const n = (v: number) => v.toLocaleString("en-US");

export default function IporFusionVaultsInfoPage() {
  const roster = iporFusionRoster(MAINNET_CHAIN_ID);
  return (
    <VaultsInfoPage chainId={MAINNET_CHAIN_ID} protocol={protocolForHref("/ethereum/ipor-fusion")!}>
      <p data-intro-membership>
        An IPOR Fusion vault, a PlasmaVault in IPOR&rsquo;s code, takes deposits of one token and issues shares for
        them. Its curator moves the token into other protocols through fuses: small contracts that each speak to one
        protocol, which the vault runs. What a share is worth is the vault&rsquo;s answer to{" "}
        <code>convertToAssets</code>, which is what the Share price column on the roster shows, in the vault&rsquo;s
        asset.
      </p>
      <p data-intro-roster>
        The roster is every vault the factory made on Ethereum, {n(roster.vaults.length)} of them at block{" "}
        {n(roster.censusBlock)}. Anyone may deploy from the factory, and a deployment is announced by a creation event
        on it, which is the only enumeration there is. The factory&rsquo;s registry answers false for vaults made before
        it was added, so the roster follows the events. That makes it a floor: a vault deployed by hand or by an earlier
        factory announces nothing, and a vault made since the census block joins when the census runs again.
      </p>
      <p data-intro-roles>
        Each vault has an access manager that grants roles. Rails calls the holder of OWNER_ROLE the vault&rsquo;s owner
        and the holder of ALPHA_ROLE its curator; IPOR calls the curator the Alpha, and the Atomist, who manages the
        vault&rsquo;s settings and fuses, keeps IPOR&rsquo;s word. Every other role is named by its constant in
        IPOR&rsquo;s code. The access manager keeps no list of a role&rsquo;s holders, so a factsheet finds them in its
        grant events and confirms each one at the block it reads.
      </p>
      <p data-intro-units>
        Every figure on the roster is a quantity of one vault&rsquo;s asset, and nothing is priced in dollars, so the
        only comparisons the page offers are between quantities of the same token. A vault&rsquo;s position in a
        protocol Rails covers is that explorer&rsquo;s row, under the vault&rsquo;s address.
      </p>
    </VaultsInfoPage>
  );
}
