// Uniswap V3 on Ethereum: the front door, a wallet field landing on that
// wallet's positions (components/protocol/uniswap/uniswap-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { UniswapFrontDoor } from "@/components/protocol/uniswap/uniswap-front-door";

export const metadata = listingMetadata({
  title: "Uniswap V3 on Ethereum",
  canonicalPath: "/ethereum/uniswap-v3",
});

export default function Page() {
  return <UniswapFrontDoor version="v3" />;
}
