"use client";

// The front door of Morpho Blue read on visit (N5; rails-ops ui-jobs 577 and
// 578), Arc's or Optimism's: the pool front door (`PoolFrontDoor`), landing on
// a wallet's positions, with a link to the Markets page.

import { PoolFrontDoor } from "@/components/protocol/uniswap/uniswap-front-door";
import { frontDoorWords, LABEL } from "@/lib/morpho-at-block/words";
import type { MorphoAtBlockDeployment } from "@/lib/morpho-at-block/types";

export function MorphoAtBlockFrontDoor({ dep }: { dep: MorphoAtBlockDeployment }) {
  const words = frontDoorWords(dep);
  // Optimism names its chain and draws no line, as the shared front door (ui-jobs 578); Arc follows
  // with its own review.
  const optimism = dep.chainId === 10;
  return (
    <PoolFrontDoor
      id={dep.session}
      label={LABEL}
      line={optimism ? undefined : words.line}
      route={dep.route}
      chainId={optimism ? 10 : undefined}
      links={[{ href: `${dep.route}/markets`, label: words.links.markets }]}
    />
  );
}
