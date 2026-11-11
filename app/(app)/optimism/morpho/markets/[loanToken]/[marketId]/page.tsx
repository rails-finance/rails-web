// Morpho Blue on Optimism, one market (/optimism/morpho/markets/<loan token>/<market id>):
// the shared market page on rails-server's read of that market at the head,
// with the feeds its oracle names
// (components/protocol/morpho-at-block/morpho-at-block-market-routes.tsx).

import type { Metadata } from "next";
import {
  morphoAtBlockMarketMetadata,
  morphoAtBlockMarketPageProps,
} from "@/components/protocol/morpho-at-block/morpho-at-block-market-routes";
import { MorphoMarketPage } from "@/lib/morpho/product";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { MORPHO_OPTIMISM } from "@/lib/morpho-at-block/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ loanToken: string; marketId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { loanToken, marketId } = await params;
  return morphoAtBlockMarketMetadata(MORPHO_OPTIMISM, loanToken, marketId);
}

export default async function MorphoOptimismMarketRoute({ params }: Params) {
  const { loanToken, marketId } = await params;
  return (
    <>
      <MorphoMarketPage {...await morphoAtBlockMarketPageProps(MORPHO_OPTIMISM, loanToken, marketId)} />
      <ProvInspectorLayer />
    </>
  );
}
