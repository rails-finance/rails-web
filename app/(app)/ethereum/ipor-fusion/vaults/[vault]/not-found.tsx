// The 404 body for an address the IPOR Fusion census on Ethereum does not hold.
import { IporFusionVaultNotFound } from "@/components/vaults/ipor-fusion-routes";

export default function NotFound() {
  return <IporFusionVaultNotFound chainId={1} />;
}
