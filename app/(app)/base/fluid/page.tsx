// Fluid on Base: the front door, a wallet field landing on that wallet's vault
// positions (components/protocol/fluid-base/fluid-base-front-door.tsx).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { FluidBaseFrontDoor } from "@/components/protocol/fluid-base/fluid-base-front-door";

export const metadata = listingMetadata({
  title: "Fluid on Base",
  canonicalPath: "/base/fluid",
});

export default function Page() {
  return <FluidBaseFrontDoor />;
}
