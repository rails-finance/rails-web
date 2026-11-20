// One asset under this explorer (decision 0069; the shared page,
// components/assets/protocol-assets-page.tsx).

import { ProtocolAssetPage, protocolAssetMetadata } from "@/components/assets/protocol-assets-page";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  return protocolAssetMetadata("aave-v4", (await params).token);
}

export default async function Page({ params }: { params: Params }) {
  return <ProtocolAssetPage id="aave-v4" token={(await params).token} />;
}
