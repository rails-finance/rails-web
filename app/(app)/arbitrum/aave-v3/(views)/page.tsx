// Aave V3 on Arbitrum — the front door: the protocol's mark, a wallet field
// and the links to the market overview, the positions read and the info page
// (components/shared/protocol-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { ProtocolFrontDoor } from "@/components/shared/protocol-front-door";
import { withExplorerAbout } from "@/components/shared/explorer-about";

export const metadata = listingMetadata({
  title: "Aave V3 on Arbitrum",
  canonicalPath: "/arbitrum/aave-v3",
});

function Page() {
  return <ProtocolFrontDoor session="aave-v3-arbitrum" />;
}

export default withExplorerAbout("/arbitrum/aave-v3", Page);
