// The Pendle market roster on Ethereum, /ethereum/pendle/markets: the
// explorer's first sub-page and what /ethereum/pendle opens on. Every market
// the router record names, read at one block, grouped by the protocol behind
// its yield token (a Rails label); each row opens the market's page.

import { headers } from "next/headers";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { protocolForHref } from "@/lib/shared/protocols";
import { readPendleRoster } from "@/lib/sources/api/pendle";
import { toURLSearchParams, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { PendleRosterView, PendleWalletSearch } from "@/components/protocol/pendle/pendle-roster";
import { PendleReadNotice } from "@/components/protocol/pendle/pendle-read-notice";

export const dynamic = "force-dynamic";

const PROTOCOL = protocolForHref("/ethereum/pendle")!;

export const metadata = listingMetadata({
  title: "Pendle markets on Ethereum",
  canonicalPath: "/ethereum/pendle/markets",
  description:
    "Every Pendle market on Ethereum the routers have named: its implied APY, pool and maturity read at one block, grouped by the protocol behind its yield token.",
});

export default async function PendleMarketsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const initialSearch = toURLSearchParams(await searchParams).toString();
  const ip = readerIpFromRequest({ headers: await headers() });
  const read = await readPendleRoster(ip);
  const at = Math.floor(Date.now() / 1000);
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader protocol={PROTOCOL} title="Markets" />
        <div className="mb-8 max-w-xl">
          <PendleWalletSearch />
        </div>
        {read.ok ? (
          <PendleRosterView roster={read.data} at={at} initialSearch={initialSearch} />
        ) : (
          <PendleReadNotice failure={read} />
        )}
      </div>
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </div>
  );
}
