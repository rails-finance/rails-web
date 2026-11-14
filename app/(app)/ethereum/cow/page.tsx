// CoW Protocol on Ethereum: the front door, a wallet field landing on that
// wallet's trades (components/protocol/cow/cow-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { CowFrontDoor } from "@/components/protocol/cow/cow-front-door";

// focus: the explorer's front door, a wallet look-up with no list; FocusChainGate gates the explorer when the focus hides it.

export const metadata = listingMetadata({
  title: "CoW Protocol on Ethereum",
  canonicalPath: "/ethereum/cow",
});

export default function Page() {
  return <CowFrontDoor />;
}
