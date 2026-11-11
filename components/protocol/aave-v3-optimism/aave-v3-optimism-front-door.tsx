"use client";

// Aave V3 on Optimism's front door (N5; rails-ops ui-jobs 578): the pool front
// door (`PoolFrontDoor`), landing on a wallet's account, with the market
// overview beside it.

import { PoolFrontDoor } from "@/components/protocol/uniswap/uniswap-front-door";
import { FRONT_DOOR, LABEL } from "@/lib/aave-v3-optimism/words";
import { OP_ROUTE, OP_SESSION } from "@/lib/aave-v3-optimism/types";

export function AaveV3OptimismFrontDoor() {
  return (
    <PoolFrontDoor
      id={OP_SESSION}
      label={LABEL}
      line={FRONT_DOOR.line}
      route={OP_ROUTE}
      links={[{ href: `${OP_ROUTE}/markets`, label: FRONT_DOOR.links.markets }]}
    />
  );
}
