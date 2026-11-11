// One Compound V3 market on Optimism (/optimism/compound-v3/markets/<comet>, the
// Comet's roster key: usdc, usdt, weth), archetype A2 on the shared product shell
// (lib/compound/product.tsx): the Comet's head, then its collateral, from the
// markets read.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompoundCometPage } from "@/lib/compound/product";
import { cometData } from "@/lib/compound/product-routes";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { fetchCompoundV3OptimismMarkets } from "@/lib/api/fetch-compound-v3-optimism";
import { compoundOptimismMarketOf } from "@/lib/compound-v3-optimism/asset-catalog";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const dynamic = "force-dynamic";

type Params = Promise<{ comet: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const m = compoundOptimismMarketOf((await params).comet);
  if (!m) return {};
  return listingMetadata({
    title: `Compound V3 ${m.label} on Optimism`,
    canonicalPath: `/optimism/compound-v3/markets/${m.key}`,
    description: `Compound V3's ${m.baseSymbol} market on Optimism, read when the page opens: its supply and borrow rates, utilisation against the kink, reserves against their target, minimum borrow and every collateral asset's terms.`,
  });
}

export default async function Page({ params }: { params: Params }) {
  const m = compoundOptimismMarketOf((await params).comet);
  if (!m) notFound();
  const data = await fetchCompoundV3OptimismMarkets();
  return (
    <>
      <CompoundCometPage data={cometData(data, m.key)} chain="optimism" comet={m.key} />
      <ProvInspectorLayer />
    </>
  );
}
