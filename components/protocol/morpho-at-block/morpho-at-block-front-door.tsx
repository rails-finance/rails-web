"use client";

// The front door of Morpho Blue read on visit (N5; rails-ops ui-jobs 577 and
// 578), Arc's or Optimism's: the pool front door (`PoolFrontDoor`), landing on
// a wallet's positions, with a link to the Markets page.

import { PoolFrontDoor } from "@/components/protocol/uniswap/uniswap-front-door";
import { frontDoorWords, LABEL } from "@/lib/morpho-at-block/words";
import type { MorphoAtBlockDeployment } from "@/lib/morpho-at-block/types";

export function MorphoAtBlockFrontDoor({ dep }: { dep: MorphoAtBlockDeployment }) {
  const words = frontDoorWords(dep);
  return (
    <PoolFrontDoor
      id={dep.session}
      label={LABEL}
      line={words.line}
      route={dep.route}
      links={[{ href: `${dep.route}/markets`, label: words.links.markets }]}
    />
  );
}
