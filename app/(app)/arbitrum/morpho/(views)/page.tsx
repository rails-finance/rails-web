// Morpho Blue on Arbitrum — the front door: the protocol's mark, a wallet
// field and the links to the market overview, the positions read and the info
// page (components/shared/protocol-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { ProtocolFrontDoor } from "@/components/shared/protocol-front-door";
import { withExplorerAbout } from "@/components/shared/explorer-about";

export const metadata = listingMetadata({
  title: "Morpho Blue on Arbitrum",
  canonicalPath: "/arbitrum/morpho",
});

function Page() {
  return <ProtocolFrontDoor session="morpho-arbitrum" />;
}

export default withExplorerAbout("/arbitrum/morpho", Page);
