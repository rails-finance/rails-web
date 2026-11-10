"use client";

// Aerodrome's front door (N5; rails-ops ui-jobs 566): Uniswap's
// (`PoolFrontDoor`), landing on a wallet's Slipstream positions on Base.

import { PoolFrontDoor } from "@/components/protocol/uniswap/uniswap-front-door";
import { FRONT_DOOR, LABEL } from "@/lib/aerodrome/words";

export function AerodromeFrontDoor() {
  return <PoolFrontDoor id="aerodrome" label={LABEL} line={FRONT_DOOR.line} route="/base/aerodrome" />;
}
