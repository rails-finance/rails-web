"use client";

// Euler V2's front door (N5): Uniswap's (`PoolFrontDoor`), landing on a
// wallet's Euler accounts on the chain.

import { PoolFrontDoor } from "@/components/protocol/uniswap/uniswap-front-door";
import { EULER_SESSION, type EulerChainId } from "@/lib/euler/types";
import { FRONT_DOOR, LABEL } from "@/lib/euler/words";
import { explorerHref } from "@/lib/shared/protocols";

export function EulerFrontDoor({ chain }: { chain: EulerChainId }) {
  return (
    <PoolFrontDoor
      id={EULER_SESSION[chain]}
      label={LABEL}
      line={FRONT_DOOR.line(chain)}
      route={explorerHref(chain, "euler-v2")}
    />
  );
}
