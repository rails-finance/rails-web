// One Compound V3 market on Arbitrum (/arbitrum/compound-v3/markets/<comet>, the Comet's
// roster key: usdc, weth, ...), archetype A2 on the shared product shell
// (rails-ops ui-jobs 549/550; decision 0059): the Comet's head as on the
// roster, then its collateral, each section with its own ⋮.
//
// ISR, ten minutes, as the roster.

import { notFound } from "next/navigation";
import { CompoundCometPage } from "@/lib/compound/product";
import { cometData, cometMetadata, cometParams, isComet, loadComets } from "@/lib/compound/product-routes";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const revalidate = 600;
export const dynamicParams = false;

export function generateStaticParams() {
  return cometParams("arbitrum");
}

export async function generateMetadata({ params }: { params: Promise<{ comet: string }> }) {
  const { comet } = await params;
  return cometMetadata("arbitrum", comet);
}

export default async function CompoundArbitrumCometRoute({ params }: { params: Promise<{ comet: string }> }) {
  const { comet } = await params;
  if (!isComet("arbitrum", comet)) notFound();
  const data = await loadComets("arbitrum");
  return (
    <>
      <CompoundCometPage data={cometData(data, comet)} chain="arbitrum" comet={comet} />
      <ProvInspectorLayer />
    </>
  );
}
