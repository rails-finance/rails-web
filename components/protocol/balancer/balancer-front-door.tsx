"use client";

// Balancer V3's front door (N5; rails-ops ui-jobs 569): Uniswap's
// (`PoolFrontDoor`), landing on a wallet's pool shares on Ethereum.

import { PoolFrontDoor } from "@/components/protocol/uniswap/uniswap-front-door";
import { FRONT_DOOR, LABEL } from "@/lib/balancer/words";

export function BalancerFrontDoor() {
  return <PoolFrontDoor id="balancer-v3" label={LABEL} line={FRONT_DOOR.line} route="/ethereum/balancer-v3" />;
}
