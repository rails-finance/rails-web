// Morpho Blue on Optimism: the front door, a wallet field landing on that wallet's
// positions, with the Markets page beside it
// (components/protocol/morpho-at-block/morpho-at-block-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { MorphoAtBlockFrontDoor } from "@/components/protocol/morpho-at-block/morpho-at-block-front-door";
import { MORPHO_OPTIMISM } from "@/lib/morpho-at-block/types";

export const metadata = listingMetadata({
  title: "Morpho Blue on Optimism",
  canonicalPath: "/optimism/morpho",
});

export default function Page() {
  return <MorphoAtBlockFrontDoor dep={MORPHO_OPTIMISM} />;
}
