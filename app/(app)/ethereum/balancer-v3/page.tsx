// Balancer V3 on Ethereum: the front door, a wallet field landing on that
// wallet's pool shares (components/protocol/balancer/balancer-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { BalancerFrontDoor } from "@/components/protocol/balancer/balancer-front-door";

// focus: the explorer's front door, a wallet look-up with no list; FocusChainGate gates the explorer when the focus hides it.

export const metadata = listingMetadata({
  title: "Balancer V3",
  canonicalPath: "/ethereum/balancer-v3",
});

export default function Page() {
  return <BalancerFrontDoor />;
}
