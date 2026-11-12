// One Pendle market on Ethereum, /ethereum/pendle/markets/<market>, archetype
// A2 on the shared product shell (rails-ops ui-jobs 549 step 8; decision 0059
// point 10): the head on the vitals band, how the market is built, its pool
// and its latest router events (lib/pendle/product.tsx). A Morpho or Aave V4
// PT chip opens here (the asset panel's market row).
//
// Rendered on each request, never at build.

import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { protocolForHref } from "@/lib/shared/protocols";
import { outsideTokenMeta, readPendleMarket } from "@/lib/sources/api/pendle";
import { toURLSearchParams, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { PendleMarketProductPage } from "@/lib/pendle/product";
import { PendleReadNotice } from "@/components/protocol/pendle/pendle-read-notice";
import { marketName } from "@/lib/pendle/format";

export const dynamic = "force-dynamic";

const PROTOCOL = protocolForHref("/ethereum/pendle")!;
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
  if (!read.ok)
    return (
      <div className="min-h-screen">
        <div className="py-8">
          <SubPageHeader protocol={PROTOCOL} title={`${m.slice(0, 6)}…${m.slice(-4)}`} />
          <PendleReadNotice failure={read} />
        </div>
      </div>
    );
  const meta = await outsideTokenMeta(read.data);
  return (
    <>
      <PendleMarketProductPage m={read.data} meta={meta} initialSearch={initialSearch} />
      {/* The inspector, armed from the profile menu's switch. */}
      <ProvInspectorLayer />
    </>
  );
}
