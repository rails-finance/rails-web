// Compound V3 on Arbitrum — the protocol page: a wallet input over the four
// Comets' market overview. The overview is read here, on the server, as the
// Base market page reads it; the client half is protocol-page.tsx beside this
// file.

import { listingMetadata } from "@/lib/shared/page-metadata";
import { loadCompoundV3Markets } from "@/lib/sources/chain/compound-markets";
import { COMPOUND_ARBITRUM_DEPLOYMENT } from "@/lib/compound-arbitrum/asset-catalog";
import { CompoundArbitrumProtocolPage } from "./protocol-page";

export const metadata = listingMetadata({
  title: "Compound V3 on Arbitrum",
  canonicalPath: "/arbitrum/compound-v3",
});

// ISR, ten minutes, as the Base market page: one render serves every visitor,
// and the stamp names the block the read happened at.
export const revalidate = 600;

export default async function Page() {
  const data = await loadCompoundV3Markets(COMPOUND_ARBITRUM_DEPLOYMENT);
  return <CompoundArbitrumProtocolPage data={data} />;
}
