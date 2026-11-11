// Morpho Blue on Arc, one market (/arc/morpho/markets/<loan token>/<market id>):
// the shared market page (lib/morpho/product.tsx) on rails-server's read of
// that market at the head, with the feeds its oracle names.

import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MorphoMarketPage } from "@/lib/morpho/product";
import { marketViewData } from "@/lib/morpho/markets-shape";
import { fetchMorphoArcMarket } from "@/lib/api/fetch-morpho-arc";
import { arcMarketResponse } from "@/lib/morpho-arc/markets";
import { MORPHO_ARC_ROUTE } from "@/lib/morpho-arc/types";
import { ARC_CHAIN_ID } from "@/lib/shared/chains";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-f]{40}$/;
const MARKET_ID = /^0x[0-9a-f]{64}$/;
const load = cache((id: string) => fetchMorphoArcMarket(id));

type Params = { params: Promise<{ loanToken: string; marketId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { loanToken, marketId } = await params;
  const token = loanToken.toLowerCase();
  const id = marketId.toLowerCase();
  if (!ADDRESS.test(token) || !MARKET_ID.test(id)) return { title: "Morpho Blue market on Arc" };
  const a = await load(id);
  const m = a.kind === "ok" ? arcMarketResponse(a.data).market : null;
  const pair = m ? `${m.collateralSymbol ?? "no collateral"} / ${m.loanSymbol}` : "Morpho Blue market";
  return {
    title: `${pair} · Morpho Blue on Arc`,
    description: `One Morpho Blue market on Arc, ${pair}: what it holds, what it pays and charges, its rate curve, its oracle price and its terms.`,
    alternates: { canonical: `/arc/morpho/markets/${token}/${id}` },
    robots: { index: false },
  };
}

export default async function MorphoArcMarketRoute({ params }: Params) {
  const { loanToken, marketId } = await params;
  const token = loanToken.toLowerCase();
  const id = marketId.toLowerCase();
  if (!ADDRESS.test(token) || !MARKET_ID.test(id)) notFound();
  const a = await load(id);
  if (a.kind === "not-found") notFound();
  const data = a.kind === "ok" ? arcMarketResponse(a.data) : null;
  if (data && data.params.loanToken !== token) notFound();
  return (
    <>
      <MorphoMarketPage
        data={data ? marketViewData(data) : null}
        chainId={ARC_CHAIN_ID}
        pair="Morpho Blue market"
        positions={{ href: MORPHO_ARC_ROUTE, label: "A wallet's Morpho Blue positions on Arc" }}
      />
      <ProvInspectorLayer />
    </>
  );
}
