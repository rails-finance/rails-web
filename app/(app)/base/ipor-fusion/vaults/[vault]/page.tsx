// One IPOR Fusion vault's factsheet on Base (components/vaults/ipor-fusion-routes.tsx).
// Every vault the census holds; any other address 404s.
import { IporFusionVaultRoute, iporFusionVaultMetadata } from "@/components/vaults/ipor-fusion-routes";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ vault: string }> };

export const generateMetadata = ({ params }: Props) => iporFusionVaultMetadata(8453, params);

export default function Page({ params }: Props) {
  return <IporFusionVaultRoute chainId={8453} params={params} />;
}
