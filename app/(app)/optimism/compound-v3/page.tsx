// Compound V3 on Optimism: the front door, a wallet field landing on that
// wallet's Comets, with the market overview beside it
// (components/protocol/compound-v3-optimism/compound-v3-optimism-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { CompoundV3OptimismFrontDoor } from "@/components/protocol/compound-v3-optimism/compound-v3-optimism-front-door";

// focus: the explorer's front door, a wallet look-up with no list; FocusChainGate gates the explorer when the focus hides it.

export const metadata = listingMetadata({
  title: "Compound V3 on Optimism",
  canonicalPath: "/optimism/compound-v3",
  description:
    "Look up any wallet's Compound V3 accounts on Optimism: what it lends, borrows and puts up as collateral in each of the three Comets.",
});

export default function Page() {
  return <CompoundV3OptimismFrontDoor />;
}
