// ONE VAULT'S PAGE — /base/morpho/vaults/<vault>. The page is the shared
// MetaMorpho vault route (components/vaults/metamorpho-vault-route.tsx) on Base.
//
// The /api/chain/morpho-base/vault route serves the identical read for anything
// that wants the numbers without the page; this page does not go through it,
// one hop shorter. The sibling route /base/morpho/<vault> also resolves for the
// same address — it is the vault's OWN Blue positions, which is a true and
// different page. The card's ⋮ links to it, V3 links into it per market, and
// that page links back here.

import {
  MetaMorphoVaultRoute,
  metaMorphoVaultMetadata,
  type MetaMorphoVaultParams,
} from "@/components/vaults/metamorpho-vault-route";

// Every figure is a slot read at the head, and the holder rides in the query —
// nothing about this is cacheable across requests.
export const dynamic = "force-dynamic";

export function generateMetadata(props: MetaMorphoVaultParams) {
  return metaMorphoVaultMetadata(8453, props);
}

export default function MorphoBaseVaultPage(props: MetaMorphoVaultParams) {
  return <MetaMorphoVaultRoute chainId={8453} {...props} />;
}
