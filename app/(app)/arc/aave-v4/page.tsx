// Aave V4 on Arc: the front door, a wallet field landing on that wallet's
// spoke accounts, with the Markets and Hubs pages beside it
// (components/protocol/aave-v4-arc/aave-v4-arc-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { AaveV4ArcFrontDoor } from "@/components/protocol/aave-v4-arc/aave-v4-arc-front-door";

export const metadata = listingMetadata({
  title: "Aave V4 on Arc",
  canonicalPath: "/arc/aave-v4",
});

export default function Page() {
  return <AaveV4ArcFrontDoor />;
}
