// Aave V3 on Optimism: the front door, a wallet field landing on that wallet's
// account, with the market overview beside it
// (components/protocol/aave-v3-optimism/aave-v3-optimism-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { AaveV3OptimismFrontDoor } from "@/components/protocol/aave-v3-optimism/aave-v3-optimism-front-door";

// focus: the explorer's front door, a wallet look-up with no list; FocusChainGate gates the explorer when the focus hides it.

export const metadata = listingMetadata({
  title: "Aave V3 on Optimism",
  canonicalPath: "/optimism/aave-v3",
});

export default function Page() {
  return <AaveV3OptimismFrontDoor />;
}
