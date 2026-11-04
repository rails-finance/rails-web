// CoW on Ethereum: the front door, a wallet field landing on that
// wallet's trades (components/protocol/cow/cow-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { CowFrontDoor } from "@/components/protocol/cow/cow-front-door";

export const metadata = listingMetadata({
  title: "CoW on Ethereum",
  canonicalPath: "/ethereum/cow",
});

export default function Page() {
  return <CowFrontDoor />;
}
