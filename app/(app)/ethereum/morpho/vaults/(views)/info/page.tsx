// How Morpho's vault layer on Ethereum is built — /ethereum/morpho/vaults/info
// (rails-ops ui-jobs 486). The page is the shared one
// (components/vaults/metamorpho-vaults-info.tsx).

import { MetaMorphoVaultsInfo } from "@/components/vaults/metamorpho-vaults-info";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "About MetaMorpho vaults on Ethereum",
  canonicalPath: "/ethereum/morpho/vaults/info",
  description:
    "How Rails counts the holders of MetaMorpho vaults on Ethereum: every address in each vault's transfers since its creation block, checked against the vault's total supply, and the three blocks the section reads at.",
});

export default function EthereumMorphoVaultsInfoPage() {
  return <MetaMorphoVaultsInfo chainId={1} />;
}
