// Morpho Blue on Arc: the front door, a wallet field landing on that wallet's
// positions, with the Markets page beside it
// (components/protocol/morpho-arc/morpho-arc-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { MorphoArcFrontDoor } from "@/components/protocol/morpho-arc/morpho-arc-front-door";

export const metadata = listingMetadata({
  title: "Morpho Blue on Arc",
  canonicalPath: "/arc/morpho",
});

export default function Page() {
  return <MorphoArcFrontDoor />;
}
