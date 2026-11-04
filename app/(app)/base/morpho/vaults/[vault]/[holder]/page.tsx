// ONE HOLDING — /base/morpho/vaults/<vault>/<holder>. The page is the shared
// MetaMorpho holding route (components/vaults/metamorpho-holder-route.tsx) on
// Base.

import {
  MetaMorphoHolderRoute,
  metaMorphoHolderMetadata,
  type MetaMorphoHolderParams,
} from "@/components/vaults/metamorpho-holder-route";

// Every figure is a call at the head with the holder in the path — nothing
// about this is cacheable across requests.
export const dynamic = "force-dynamic";

export function generateMetadata(props: MetaMorphoHolderParams) {
  return metaMorphoHolderMetadata(8453, props);
}

export default function MorphoBaseVaultPositionPage(props: MetaMorphoHolderParams) {
  return <MetaMorphoHolderRoute chainId={8453} {...props} />;
}
