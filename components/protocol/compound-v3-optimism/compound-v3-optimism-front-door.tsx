"use client";

// Compound V3 on Optimism's front door (N5; rails-ops ui-jobs 578): the pool front
// door (`PoolFrontDoor`), landing on a wallet's Comets, with the market overview
// beside it.

import { PoolFrontDoor } from "@/components/protocol/uniswap/uniswap-front-door";
import { FRONT_DOOR, LABEL } from "@/lib/compound-v3-optimism/words";
import { OPC_ROUTE, OPC_SESSION } from "@/lib/compound-v3-optimism/types";

export function CompoundV3OptimismFrontDoor() {
  return (
    <PoolFrontDoor
      id={OPC_SESSION}
      label={LABEL}
      line={FRONT_DOOR.line}
      route={OPC_ROUTE}
      links={[{ href: `${OPC_ROUTE}/markets`, label: FRONT_DOOR.links.markets }]}
    />
  );
}
