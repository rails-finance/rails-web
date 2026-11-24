// The assets this explorer uses on its chain (decision 0069; the shared page,
// components/assets/protocol-assets-page.tsx).

import { ProtocolAssetsPage, protocolAssetsMetadata } from "@/components/assets/protocol-assets-page";

export const dynamic = "force-dynamic";
export const metadata = protocolAssetsMetadata("morpho");

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function Page({ searchParams }: { searchParams: Search }) {
  return <ProtocolAssetsPage id="morpho" searchParams={searchParams} />;
}
