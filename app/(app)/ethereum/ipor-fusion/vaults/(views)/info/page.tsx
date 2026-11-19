// focus: the explorer's explainer; the shell's gate stands over the explorer
// How the IPOR Fusion roster on Ethereum is built (components/vaults/ipor-fusion-routes.tsx).
import { IporFusionInfoPage, iporFusionInfoMetadata } from "@/components/vaults/ipor-fusion-routes";

export const metadata = iporFusionInfoMetadata(1);

export default function Page() {
  return <IporFusionInfoPage chainId={1} />;
}
