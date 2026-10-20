// Morpho Blue on Arbitrum — the front door: the protocol's mark, a wallet
// field and the links to the market overview, the positions read and the info
// page (components/shared/protocol-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { ProtocolFrontDoor } from "@/components/shared/protocol-front-door";

export const metadata = listingMetadata({
  title: "Morpho Blue on Arbitrum",
  canonicalPath: "/arbitrum/morpho",
});

export default function Page() {
  return <ProtocolFrontDoor session="morpho-arbitrum" />;
}
