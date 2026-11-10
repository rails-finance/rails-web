// Aave V3 on Arbitrum — the front door: the protocol's mark, a wallet field
// and the links to the market overview, the positions read and the info page
// (components/shared/protocol-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { ProtocolFrontDoor } from "@/components/shared/protocol-front-door";

// focus: the explorer's front door, a wallet look-up with no list; FocusChainGate gates the explorer when the focus hides it.

export const metadata = listingMetadata({
  title: "Aave V3 on Arbitrum",
  canonicalPath: "/arbitrum/aave-v3",
  description: "Look up any wallet's Aave V3 position on Arbitrum: collateral, debt and health, read from the chain.",
});

function Page() {
  return <ProtocolFrontDoor session="aave-v3-arbitrum" />;
}

export default Page;
