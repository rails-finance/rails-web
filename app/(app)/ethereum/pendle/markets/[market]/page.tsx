// One Pendle market on Ethereum, /ethereum/pendle/markets/<market>: its card
// at one block, its tokens and its latest router events. A Morpho or Aave V4
// PT chip opens here (the asset panel's market row).

import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { RailHeader } from "@/components/shared/rail-header";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { outsideTokenMeta, readPendleMarket } from "@/lib/sources/api/pendle";
import { toURLSearchParams, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { PendleMarketView } from "@/components/protocol/pendle/pendle-market-view";
import { PendleReadNotice } from "@/components/protocol/pendle/pendle-read-notice";
import { marketName } from "@/lib/pendle/format";

export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
type Params = { params: Promise<{ market: string }> };

const load = cache(async (market: string) => {
  const ip = readerIpFromRequest({ headers: await headers() });
  return readPendleMarket(market, ip);
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { market } = await params;
  const m = market.toLowerCase();
  if (!ADDRESS.test(m)) return { title: "Pendle market" };
  const read = await load(m);
  const name = read.ok ? marketName(read.data.tokens) : `${m.slice(0, 6)}…${m.slice(-4)}`;
  return {
    title: `${name} · Pendle market`,
    description: `The Pendle market ${name} on Ethereum: its implied APY, pool, PT price and maturity at one block, and its latest router events.`,
    alternates: { canonical: `/ethereum/pendle/markets/${m}` },
  };
}

export default async function PendleMarketPage({
  params,
  searchParams,
}: Params & { searchParams: Promise<RawSearchParams> }) {
  const initialSearch = toURLSearchParams(await searchParams).toString();
  const { market } = await params;
  const m = market.toLowerCase();
  if (!ADDRESS.test(m)) notFound();
  const read = await load(m);
  if (!read.ok && read.code === "not_a_market") notFound();
  const meta = read.ok ? await outsideTokenMeta(read.data) : {};
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5">
          <div className="mb-2.5">
            <RailHeader session="pendle" venue="subPage" />
          </div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-rb-500">Pendle market</div>
          <h1 className="text-2xl font-semibold text-foreground">{read.ok ? marketName(read.data.tokens) : m}</h1>
        </header>
        {read.ok ? (
          <PendleMarketView m={read.data} meta={meta} initialSearch={initialSearch} />
        ) : (
          <PendleReadNotice failure={read} />
        )}
      </div>
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </div>
  );
}
