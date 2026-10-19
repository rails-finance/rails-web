"use client";

// One Morpho Blue position on Arbitrum: the shared position page
// (components/protocol/morpho/morpho-market-position-page.tsx) with the
// Arbitrum deployment (lib/morpho-arbitrum/page-deployment.ts) and this
// market's dollar line.

import {
  MorphoMarketPositionView,
  type MorphoMarketPositionViewProps,
} from "@/components/protocol/morpho/morpho-market-position-page";
import { MorphoArbitrumUsdLine } from "@/components/protocol/morpho/morpho-arbitrum-usd-line";
import { MORPHO_ARBITRUM_PAGE } from "@/lib/morpho-arbitrum/page-deployment";

export default function MorphoArbitrumPositionView(
  props: Omit<MorphoMarketPositionViewProps, "vaultOwner" | "grouped" | "summary">,
) {
  return (
    <MorphoMarketPositionView
      deployment={MORPHO_ARBITRUM_PAGE}
      vaultOwner={null}
      summary={(data) => <MorphoArbitrumUsdLine data={data} market={props.market} />}
      {...props}
    />
  );
}
