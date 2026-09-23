// Morpho Blue on Base — one market (/base/morpho/markets/<loan token>/<market
// id>). The loan-token page above it draws this market as one row; this is
// the row opened: the market read alone at one head block — sizes, rates, the
// oracle's price and when its feeds published it — then every position in it,
// through the positions listing fixed to this market.
//
// The id must be on the roster (the census plus the index's tail) and must lend
// the token the path names; anything else is the 404. The market's read and the
// listing's first page are fetched together.

import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RailHeader } from "@/components/shared/rail-header";
import { MorphoMarketView } from "@/components/protocol/morpho/morpho-market-view";
import { loadMorphoMarketFromChain } from "@/lib/sources/chain/morpho-markets";
import { marketViewData } from "@/lib/morpho/markets-shape";
import { morphoMarketHref } from "@/lib/morpho/market-routes";
import { MORPHO_BASE_DEPLOYMENT } from "@/lib/sources/chain/morpho-deployments";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { MorphoBaseListing } from "../../../(views)/morpho-base-listing";
import { fetchMorphoPositions } from "@/lib/api/fetch-morpho-positions";
import {
  morphoBaseMarketDefaults,
  morphoBaseMarketDimensions,
  morphoBaseMarketFetchParams,
} from "@/lib/morpho-base/list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { unlaunchedRobotsForPath } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

/** Robots follow the roster's launch flag: every title this file builds
 *  carries `index: false` while the explorer is flagged `unlaunched` —
 *  including the malformed-address one, which is still a served response. */
const ROBOTS = unlaunchedRobotsForPath("/base/morpho/markets");

const ADDRESS = /^0x[0-9a-f]{40}$/;
const MARKET_ID = /^0x[0-9a-f]{64}$/;
const load = cache((id: string) => loadMorphoMarketFromChain(id, MORPHO_BASE_DEPLOYMENT));

type Params = {
  params: Promise<{ loanToken: string; marketId: string }>;
  searchParams: Promise<RawSearchParams>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { loanToken, marketId } = await params;
  const token = loanToken.toLowerCase();
  const id = marketId.toLowerCase();
  if (!ADDRESS.test(token) || !MARKET_ID.test(id)) return { title: "Morpho Blue Market on Base", ...ROBOTS };
  const m = (await load(id))?.market;
  const pair = m ? `${m.loanSymbol} / ${m.collateralSymbol ?? "no collateral"}` : "Morpho Blue market";
  return {
    title: `${pair} · Morpho Blue on Base`,
    description: `One Morpho Blue market on Base — ${pair}: what it holds, how used, its oracle price and when that price was published, and every position in it.`,
    alternates: { canonical: `/base/morpho/markets/${token}/${id}` },
    ...ROBOTS,
  };
}

export default async function MorphoBaseMarketPage({ params, searchParams }: Params) {
  const { loanToken, marketId } = await params;
  const token = loanToken.toLowerCase();
  const id = marketId.toLowerCase();
  if (!ADDRESS.test(token) || !MARKET_ID.test(id)) notFound();

  const defaults = morphoBaseMarketDefaults(token);
  const dims = morphoBaseMarketDimensions(defaults);
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, defaults);

  const [data, initial] = await Promise.all([
    load(id),
    ssrInitial({
      dims,
      defaults,
      filters,
      page,
      label: "Morpho Blue Base market",
      fetchPage: (baseUrl, signal, headers) =>
        fetchMorphoPositions({ ...morphoBaseMarketFetchParams(filters, page, id), baseUrl, signal, headers }).then(
          (r) => ({
            data: r.data,
            total: r.pagination.total,
          }),
        ),
    }),
  ]);
  if (!data || data.params.loanToken.toLowerCase() !== token) notFound();
  const view = marketViewData(data);

  return (
    <div className="min-h-screen">
      <div className="pt-8">
        <header className="mb-2">
          <div className="mb-2.5">
            <RailHeader session="morpho-base" venue="subPage" />
          </div>
          {view ? (
            <MorphoMarketView data={view} chainId={MORPHO_BASE_CHAIN_ID} />
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-foreground">Morpho Blue market</h1>
              <p className="mt-2 text-sm text-rb-500">This market could not be read from chain at this block.</p>
            </>
          )}
        </header>

        <MorphoBaseListing
          {...initial}
          initialSearch={sp.toString()}
          market={{ id, loanToken: token, path: morphoMarketHref(MORPHO_BASE_CHAIN_ID, token, id) }}
        />
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
