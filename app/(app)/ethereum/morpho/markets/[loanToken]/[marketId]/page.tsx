// Morpho Blue — one market (/ethereum/morpho/markets/<loan token>/<market id>).
// The loan-token page above it draws this market as one row; this is the row
// opened: the market read alone at one head block — sizes, rates, the oracle's
// price and when its feeds published it — then every position in it, through
// the positions listing fixed to this market.
//
// The id must be on the roster (the census plus the index's tail) and must lend
// the token the path names; anything else is the 404. The market's read and the
// listing's first page are fetched together; the listing fixed to one market
// needs no market roster, so none is fetched.

import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RailHeader } from "@/components/shared/rail-header";
import { MorphoMarketView } from "@/components/protocol/morpho/morpho-market-view";
import { loadMorphoMarketFromChain } from "@/lib/sources/chain/morpho-markets";
import { marketViewData } from "@/lib/morpho/markets-shape";
import { morphoMarketHref } from "@/lib/morpho/market-routes";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { MorphoListing } from "../../../(views)/morpho-listing";
import { fetchMorphoPositions } from "@/lib/api/fetch-morpho-positions";
import {
  morphoMarketDimensions,
  morphoMarketFetchParams,
  MORPHO_LIST_DEFAULTS,
} from "@/lib/morpho/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

const ADDRESS = /^0x[0-9a-f]{40}$/;
const MARKET_ID = /^0x[0-9a-f]{64}$/;
const load = cache((id: string) => loadMorphoMarketFromChain(id));

type Params = {
  params: Promise<{ loanToken: string; marketId: string }>;
  searchParams: Promise<RawSearchParams>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { loanToken, marketId } = await params;
  const token = loanToken.toLowerCase();
  const id = marketId.toLowerCase();
  if (!ADDRESS.test(token) || !MARKET_ID.test(id)) return { title: "Morpho Blue Market" };
  const m = (await load(id))?.market;
  const pair = m ? `${m.loanSymbol} / ${m.collateralSymbol ?? "no collateral"}` : "Morpho Blue market";
  return {
    title: `${pair} · Morpho Blue`,
    description: `One Morpho Blue market — ${pair}: what it holds, how used, its oracle price and when that price was published, and every position in it.`,
    alternates: { canonical: `/ethereum/morpho/markets/${token}/${id}` },
  };
}

export default async function MorphoMarketPage({ params, searchParams }: Params) {
  const { loanToken, marketId } = await params;
  const token = loanToken.toLowerCase();
  const id = marketId.toLowerCase();
  if (!ADDRESS.test(token) || !MARKET_ID.test(id)) notFound();

  const dims = morphoMarketDimensions(MORPHO_LIST_DEFAULTS);
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, MORPHO_LIST_DEFAULTS);

  const [data, initial] = await Promise.all([
    load(id),
    ssrInitial({
      dims,
      defaults: MORPHO_LIST_DEFAULTS,
      filters,
      page,
      label: "Morpho market",
      fetchPage: async (baseUrl, signal, headers) => {
        const params = morphoMarketFetchParams(filters, page, id);
        if (!params) return { data: [], total: 0 };
        const r = await fetchMorphoPositions({ ...params, baseUrl, signal, headers });
        return { data: r.data, total: r.pagination.total };
      },
    }),
  ]);
  if (!data || data.params.loanToken.toLowerCase() !== token) notFound();
  const view = marketViewData(data);

  return (
    <div className="min-h-screen">
      <div className="pt-8">
        <header className="mb-2">
          <div className="mb-2.5">
            <RailHeader session="morpho" venue="subPage" />
          </div>
          {view ? (
            <MorphoMarketView data={view} chainId={MAINNET_CHAIN_ID} />
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-foreground">Morpho Blue market</h1>
              <p className="mt-2 text-sm text-rb-500">This market could not be read from chain at this block.</p>
            </>
          )}
        </header>

        <MorphoListing
          {...initial}
          initialSearch={sp.toString()}
          market={{ id, path: morphoMarketHref(MAINNET_CHAIN_ID, token, id) }}
        />
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
