// Aave V3 on Arbitrum — the protocol page: a wallet input over the market
// overview. The client half is protocol-page.tsx beside this file.

import { listingMetadata } from "@/lib/shared/page-metadata";
import { AaveV3ArbitrumProtocolPage } from "./protocol-page";

export const metadata = listingMetadata({
  title: "Aave V3 on Arbitrum",
  canonicalPath: "/arbitrum/aave-v3",
});

export default function Page() {
  return <AaveV3ArbitrumProtocolPage />;
}
