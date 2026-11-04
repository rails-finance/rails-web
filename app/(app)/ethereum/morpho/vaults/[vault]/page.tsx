// ONE VAULT'S PAGE — /ethereum/morpho/vaults/<vault> (rails-ops ui-jobs 486).
// The page is the shared MetaMorpho vault route
// (components/vaults/metamorpho-vault-route.tsx) on Ethereum.

import {
  MetaMorphoVaultRoute,
  metaMorphoVaultMetadata,
  type MetaMorphoVaultParams,
} from "@/components/vaults/metamorpho-vault-route";

// Every figure is a slot read at the head, and the holder rides in the query —
// nothing about this is cacheable across requests.
export const dynamic = "force-dynamic";

export function generateMetadata(props: MetaMorphoVaultParams) {
  return metaMorphoVaultMetadata(1, props);
}

export default function EthereumMorphoVaultPage(props: MetaMorphoVaultParams) {
  return <MetaMorphoVaultRoute chainId={1} {...props} />;
}
