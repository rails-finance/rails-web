// Morpho Blue on Arbitrum, one market (/arbitrum/morpho/markets/<loan token>/<market id>),
// on the shared product shell (rails-ops ui-jobs 549 step 5): the market read alone
// at the head, as on Ethereum and Base. Arbitrum has no vault roster and no
// listing fixed to a market, so the page ends with its holders section and
// links to the positions Rails has read.
//
// The id must be on the census and must lend the token the path names;
// anything else is the 404. Read per request, never at build.

import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MorphoMarketPage } from "@/lib/morpho/product";
import { loadMorphoMarketFromChain } from "@/lib/sources/chain/morpho-markets";
import { marketViewData } from "@/lib/morpho/markets-shape";
import { MORPHO_ARBITRUM_DEPLOYMENT } from "@/lib/sources/chain/morpho-deployments";
import { MORPHO_ARBITRUM_CHAIN_ID } from "@/lib/morpho-arbitrum/asset-catalog";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-f]{40}$/;
const MARKET_ID = /^0x[0-9a-f]{64}$/;
const load = cache((id: string) => loadMorphoMarketFromChain(id, MORPHO_ARBITRUM_DEPLOYMENT));

type Params = { params: Promise<{ loanToken: string; marketId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { loanToken, marketId } = await params;
  const token = loanToken.toLowerCase();
  const id = marketId.toLowerCase();
  if (!ADDRESS.test(token) || !MARKET_ID.test(id)) return { title: "Morpho Blue market on Arbitrum" };
  const m = (await load(id))?.market;
  const pair = !m
    ? "Morpho Blue market"
    : m.isIdle
      ? `${m.loanSymbol} idle market`
      : `${m.collateralSymbol ?? "no collateral"} / ${m.loanSymbol}`;
  return {
    title: `${pair} · Morpho Blue on Arbitrum`,
    description: `One Morpho Blue market on Arbitrum, ${pair}: what it holds, what it pays and charges, its rate curve, its oracle price and its terms.`,
    alternates: { canonical: `/arbitrum/morpho/markets/${token}/${id}` },
  };
}

export default async function MorphoArbitrumMarketPage({ params }: Params) {
  const { loanToken, marketId } = await params;
  const token = loanToken.toLowerCase();
  const id = marketId.toLowerCase();
  if (!ADDRESS.test(token) || !MARKET_ID.test(id)) notFound();
  const data = await load(id);
  if (!data || data.params.loanToken.toLowerCase() !== token) notFound();
  return (
    <>
      <MorphoMarketPage
        data={marketViewData(data)}
        chainId={MORPHO_ARBITRUM_CHAIN_ID}
        pair="Morpho Blue market"
        positions={{ href: "/arbitrum/morpho/positions", label: "All Morpho Blue positions on Arbitrum" }}
      />
      <ProvInspectorLayer />
    </>
  );
}
