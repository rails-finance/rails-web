"use client";

// Morpho Blue on Arc's front door (N5; rails-ops ui-jobs 577): the pool front
// door (`PoolFrontDoor`), landing on a wallet's positions, with a link to the
// Markets page.

import { PoolFrontDoor } from "@/components/protocol/uniswap/uniswap-front-door";
import { FRONT_DOOR, LABEL } from "@/lib/morpho-at-block/words";
import { MORPHO_ARC_ROUTE, MORPHO_ARC_SESSION } from "@/lib/morpho-at-block/types";

export function MorphoAtBlockFrontDoor() {
  return (
    <PoolFrontDoor
      id={MORPHO_ARC_SESSION}
      label={LABEL}
      line={FRONT_DOOR.line}
      route={MORPHO_ARC_ROUTE}
      links={[{ href: `${MORPHO_ARC_ROUTE}/markets`, label: FRONT_DOOR.links.markets }]}
    />
  );
}
