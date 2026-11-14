// focus: the explorer's front door, a wallet look-up with no list; FocusChainGate gates the explorer when the focus hides it.
// Euler V2 on Arbitrum: the front door, a wallet field landing on that wallet's
// accounts (components/protocol/euler/euler-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { EulerFrontDoor } from "@/components/protocol/euler/euler-front-door";

export const metadata = listingMetadata({
  title: "Euler V2 on Arbitrum",
  canonicalPath: "/arbitrum/euler-v2",
});

export default function Page() {
  return <EulerFrontDoor chain={42161} />;
}
