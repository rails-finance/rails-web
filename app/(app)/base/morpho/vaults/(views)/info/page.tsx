// focus: the explorer's explainer; the shell's gate stands over the explorer
// How Morpho's vault layer on Base is built — /base/morpho/vaults/info. The
// page is the shared one (components/vaults/metamorpho-vaults-info.tsx).

import { MetaMorphoVaultsInfo } from "@/components/vaults/metamorpho-vaults-info";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "About MetaMorpho vaults on Base",
  canonicalPath: "/base/morpho/vaults/info",
  description:
    "How Rails builds the vault position listing on Base: membership from a whole-Transfer census swept from each vault's creation block and proven complete by Σ balanceOf, the three blocks the section reads at, the one priced figure, and what the search does and does not do.",
});

export default function BaseVaultsInfoPage() {
  return <MetaMorphoVaultsInfo chainId={8453} />;
}
