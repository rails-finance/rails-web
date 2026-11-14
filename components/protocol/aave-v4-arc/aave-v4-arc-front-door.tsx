"use client";

// Aave V4 on Arc's front door (N5; rails-ops ui-jobs 577): the pool front door
// (`PoolFrontDoor`), landing on a wallet's spoke accounts, with links to the
// Markets and Hubs pages.

import { PoolFrontDoor } from "@/components/protocol/uniswap/uniswap-front-door";
import { FRONT_DOOR, LABEL } from "@/lib/aave-v4-arc/words";
import { ARC_SESSION } from "@/lib/aave-v4-arc/types";

const ROUTE = "/arc/aave-v4";

export function AaveV4ArcFrontDoor() {
  return (
    <PoolFrontDoor
      id={ARC_SESSION}
      label={LABEL}
      line={FRONT_DOOR.line}
      route={ROUTE}
      links={[
        { href: `${ROUTE}/markets`, label: FRONT_DOOR.links.markets },
        { href: `${ROUTE}/hubs`, label: FRONT_DOOR.links.hubs },
      ]}
    />
  );
}
