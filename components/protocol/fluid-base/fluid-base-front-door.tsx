"use client";

// Fluid on Base's front door (N5; rails-ops ui-jobs 574): Uniswap's
// (`PoolFrontDoor`), landing on a wallet's Fluid vault positions on Base.

import { PoolFrontDoor } from "@/components/protocol/uniswap/uniswap-front-door";
import { FRONT_DOOR, LABEL } from "@/lib/fluid-base/words";

export function FluidBaseFrontDoor() {
  return <PoolFrontDoor id="fluid-base" label={LABEL} line={FRONT_DOOR.line} route="/base/fluid" />;
}
