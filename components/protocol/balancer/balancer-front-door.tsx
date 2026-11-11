"use client";

// Balancer V3's front door (N5; rails-ops ui-jobs 569): Uniswap's
// (`PoolFrontDoor`), landing on a wallet's pool shares on the chain.

import { PoolFrontDoor } from "@/components/protocol/uniswap/uniswap-front-door";
import { BAL_CHAINS, type BalChainId } from "@/lib/balancer/chains";
import { FRONT_DOOR, LABEL } from "@/lib/balancer/words";
import { explorerHref } from "@/lib/shared/protocols";

export function BalancerFrontDoor({ chainId }: { chainId: BalChainId }) {
  const c = BAL_CHAINS[chainId];
  return (
    <PoolFrontDoor
      id={c.session}
      label={LABEL}
      line={FRONT_DOOR.line(c.name)}
      route={explorerHref(chainId, c.session)}
    />
  );
}
