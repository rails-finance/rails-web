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

import { cache, Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MorphoMarketVaults } from "@/components/protocol/morpho/morpho-market-vaults";
import { MorphoMarketPage as MorphoMarketShell } from "@/lib/morpho/product";
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
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { AimGate } from "@/components/shared/aim-gate";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

const ADDRESS = /^0x[0-9a-f]{40}$/;
const MARKET_ID = /^0x[0-9a-f]{64}$/;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const load = cache((id: string) => loadMorphoMarketFromChain(id));

type Params = {
  params: Promise<{ loanToken: string; marketId: string }>;
  searchParams: Promise<RawSearchParams>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { loanToken, marketId } = await params;
  const token = loanToken.toLowerCase();
  const id = marketId.toLowerCase();
  if (!ADDRESS.test(token) || !MARKET_ID.test(id)) return { title: "Morpho Blue market" };
  const m = (await load(id))?.market;
  const pair = m ? `${m.loanSymbol} / ${m.collateralSymbol ?? "no collateral"}` : "Morpho Blue market";
  return {
    title: `${pair} · Morpho Blue`,
    description: `One Morpho Blue market, ${pair}: what it holds, how used, its oracle price and when that price was published, and every position in it.`,
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

  const pair = data.params.collateralToken === ZERO_ADDR ? "Idle market" : "Morpho Blue market";

  // AIM (ui-jobs 557): the market counts where its loan or collateral token is in the set.
  const aimKeys = [token, data.params.collateralToken.toLowerCase()]
    .filter((a) => a !== ZERO_ADDR)
    .map((a) => `${MAINNET_CHAIN_ID}:${a}`);

  return (
    <AimGate keys={aimKeys} what="This Morpho market">
      <MorphoMarketShell
        data={view}
        chainId={MAINNET_CHAIN_ID}
        pair={pair}
        positions={{ href: "/ethereum/morpho", label: "All Morpho Blue positions" }}
        vaults={
          view && (
            <Suspense fallback={null}>
              <MorphoMarketVaults
                chainId={MAINNET_CHAIN_ID}
                marketId={id}
                asset={{ symbol: view.market.loanSymbol, address: token, decimals: view.market.loanDecimals }}
                pair={`${view.market.collateralSymbol ?? "no collateral"} / ${view.market.loanSymbol}`}
              />
            </Suspense>
          )
        }
        listing={
          <MorphoListing
            {...initial}
            initialSearch={sp.toString()}
            market={{ id, path: morphoMarketHref(MAINNET_CHAIN_ID, token, id) }}
          />
        }
      />
      <ProvInspectorLayer />
    </AimGate>
  );
}
