// focus: the explorer's explainer; the shell's gate stands over the explorer
// How the IPOR Fusion roster on Arbitrum is built (components/vaults/ipor-fusion-routes.tsx).
import { IporFusionInfoPage, iporFusionInfoMetadata } from "@/components/vaults/ipor-fusion-routes";

export const metadata = iporFusionInfoMetadata(42161);

export default function Page() {
  return <IporFusionInfoPage chainId={42161} />;
}
