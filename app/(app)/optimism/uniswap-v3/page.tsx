// Uniswap V3 on Optimism (ui-jobs 578): the front door, a wallet field landing on that
// wallet's positions (components/protocol/uniswap/uniswap-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { UniswapFrontDoor } from "@/components/protocol/uniswap/uniswap-front-door";

// focus: the explorer's front door, a wallet look-up with no list; FocusChainGate gates the explorer when the focus hides it.

export const metadata = listingMetadata({
  title: "Uniswap V3 on Optimism",
  canonicalPath: "/optimism/uniswap-v3",
});

export default function Page() {
  return <UniswapFrontDoor version="v3" protocol="uniswap" chainId={10} />;
}
