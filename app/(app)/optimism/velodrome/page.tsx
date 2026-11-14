// Velodrome on Optimism: the front door, a wallet field landing on that wallet's
// Slipstream positions (components/protocol/aerodrome/aerodrome-front-door.tsx on
// Velodrome's site, lib/aerodrome/sites.ts).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { AerodromeFrontDoor } from "@/components/protocol/aerodrome/aerodrome-front-door";
import { VELODROME } from "@/lib/aerodrome/sites";

// focus: the explorer's front door, a wallet look-up with no list; FocusChainGate gates the explorer when the focus hides it.

export const metadata = listingMetadata({
  title: "Velodrome on Optimism",
  canonicalPath: "/optimism/velodrome",
});

export default function Page() {
  return <AerodromeFrontDoor site={VELODROME} />;
}
