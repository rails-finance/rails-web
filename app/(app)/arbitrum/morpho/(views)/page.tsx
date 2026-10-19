// Morpho Blue on Arbitrum — the protocol page: a wallet input over the
// census's markets read live. The client half is protocol-page.tsx beside
// this file.

import { listingMetadata } from "@/lib/shared/page-metadata";
import { MorphoArbitrumProtocolPage } from "./protocol-page";

export const metadata = listingMetadata({
  title: "Morpho Blue on Arbitrum",
  canonicalPath: "/arbitrum/morpho",
});

export default function Page() {
  return <MorphoArbitrumProtocolPage />;
}
