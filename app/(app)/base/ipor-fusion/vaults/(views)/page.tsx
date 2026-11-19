// The IPOR Fusion roster on Base (components/vaults/ipor-fusion-routes.tsx).
import { IporFusionRosterPage, iporFusionRosterMetadata } from "@/components/vaults/ipor-fusion-routes";
import type { RawSearchParams } from "@/lib/shared/listing-ssr";

export const dynamic = "force-dynamic";

export const generateMetadata = () => iporFusionRosterMetadata(8453);

export default function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <IporFusionRosterPage chainId={8453} searchParams={searchParams} />;
}
