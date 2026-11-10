// Aerodrome on Base: the front door, a wallet field landing on that wallet's
// Slipstream positions (components/protocol/aerodrome/aerodrome-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { AerodromeFrontDoor } from "@/components/protocol/aerodrome/aerodrome-front-door";

// focus: the explorer's front door, a wallet look-up with no list; FocusChainGate gates the explorer when the focus hides it.

export const metadata = listingMetadata({
  title: "Aerodrome on Base",
  canonicalPath: "/base/aerodrome",
});

export default function Page() {
  return <AerodromeFrontDoor />;
}
