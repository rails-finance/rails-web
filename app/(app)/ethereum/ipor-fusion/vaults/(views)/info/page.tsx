// focus: the explorer's explainer; the shell's gate stands over the explorer
// How the IPOR Fusion roster is built — /ethereum/ipor-fusion/vaults/info.
// The one place the words about the roster live (Miles, 19 Nov 2026): the
// roster carries no drawer, heading or census line. No chain read; the counts
// come from the census.

import { VaultsInfoPage } from "@/components/vaults/vaults-info-page";
import { IPOR_FUSION_DOCS } from "@/components/vaults/ipor-fusion-vault-directory-view";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { protocolForHref } from "@/lib/shared/protocols";
import { iporFusionRoster } from "@/lib/ipor-fusion/vault-roster";
import { FOOT_LINK } from "@/lib/shared/ui-grammar";

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
        An IPOR Fusion vault takes deposits of one token and issues shares for them. Its curator moves the token into
        other protocols through fuses, small contracts that each act in one protocol. A share converts to more of the
        token as those positions earn; the Share price column is the vault&rsquo;s answer to{" "}
        <code>convertToAssets</code>, in its asset.
      </p>
      <p data-intro-roster>
        The roster is every vault the IPOR Fusion factory made on Ethereum: {n(roster.vaults.length)} by block{" "}
        {n(roster.censusBlock)}, each found from the creation event the factory emits. Anyone may deploy from the
        factory, so a vault on the list is not one IPOR curates. The list is a floor: a vault deployed by hand or by an
        earlier factory emits no such event, and a vault made since that block joins when the census runs again. Every
        figure is read from chain at one block, at most five minutes old.
      </p>
      <p data-intro-roles>
        Each vault has an access manager that grants roles. Rails calls the holder of OWNER_ROLE the vault&rsquo;s
        owner, who appoints its Atomist, owners and guardians, and the holder of ALPHA_ROLE its curator, IPOR&rsquo;s
        Alpha, who moves the assets between markets. The Atomist, who manages the vault&rsquo;s settings and fuses,
        keeps IPOR&rsquo;s word, and every other role is named by its constant in IPOR&rsquo;s code. The access manager
        keeps no list of a role&rsquo;s holders, so a vault&rsquo;s page finds them in its grant events and confirms
        each one at the block it reads.
      </p>
      <p data-intro-fees>
        A vault charges a performance fee on gains in the share price and a yearly management fee on its assets, each
        minted to its fee account as new shares. The IPOR DAO keeps a register of fuses, marking each one active,
        deprecated or removed; a vault&rsquo;s page states each of its fuses&rsquo; standing there.
      </p>
      <p data-intro-units>
        Amounts are in each vault&rsquo;s asset and nothing is priced in dollars, so two assets are never ordered or
        added together. A vault&rsquo;s total assets include the balances it last recorded in each market, which can
        trail the markets. An empty vault answered zero to <code>totalAssets()</code>: one never funded looks the same
        as one whose depositors have all left. A vault&rsquo;s position in a protocol Rails covers is that
        explorer&rsquo;s row, under the vault&rsquo;s address.
      </p>
      <p data-intro-docs>
        <a href={IPOR_FUSION_DOCS.href} target="_blank" rel="noopener" className={`font-medium ${FOOT_LINK}`}>
          IPOR&rsquo;s documentation
        </a>{" "}
        explains fuses and markets in IPOR&rsquo;s terms.
      </p>
    </VaultsInfoPage>
  );
}
