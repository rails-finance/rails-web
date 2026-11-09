// One LlamaLend market (/ethereum/llamalend/markets/<controller>), archetype A2
// on the shared product shell (rails-ops ui-jobs 549 step 7; decision 0059).
// A market is one isolated pair, so the page carries what an R3 page would:
// the head, the rate curve, the parameters and the holders.
//
// Rendered on first request and kept ten minutes, never at build: the read is
// the roster's plus the market's vault and AMM rate. The route 404s a
// controller no factory lists.

import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LlamalendMarketPage } from "@/lib/llamalend/product";
import { loadLlamalendMarket } from "@/lib/sources/chain/llamalend-markets";
import { normalizeAddressParam } from "@/lib/llamalend/asset-catalog";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const revalidate = 600;

export function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ controller: string }> };

const load = cache(async (controller: string) => {
  try {
    return { data: await loadLlamalendMarket(controller), failed: false };
  } catch (e) {
    console.error("LlamaLend market read failed:", e);
    return { data: null, failed: true };
  }
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const controller = normalizeAddressParam((await params).controller);
  const m = controller ? (await load(controller)).data?.market : null;
  const pair = m ? `${m.collateralSymbol} / ${m.borrowedSymbol}` : "LlamaLend market";
  return {
    title: `${pair} · LlamaLend`,
    description: `One LlamaLend market, ${pair}: its size, rates, utilisation, band width and discounts, read from its contracts.`,
    ...(controller ? { alternates: { canonical: `/ethereum/llamalend/markets/${controller}` } } : {}),
  };
}

export default async function LlamalendMarketRoute({ params }: Params) {
  const controller = normalizeAddressParam((await params).controller);
  if (!controller) notFound();
  const { data, failed } = await load(controller);
  if (!data && !failed) notFound();
  return (
    <>
      <LlamalendMarketPage data={data} pair="LlamaLend market" />
      <ProvInspectorLayer />
    </>
  );
}
