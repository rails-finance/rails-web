// The Pendle market roster on Ethereum, /ethereum/pendle/markets, archetype A1
// on the shared product shell (rails-ops ui-jobs 549 step 8; decision 0059):
// the explorer's first sub-page and what /ethereum/pendle opens on. One head
// (Markets, Active, Matured), then every market the router record names, read
// at one block; each row opens the market's page (lib/pendle/product.tsx).
//
// Rendered per request: the roster read is rails-server's, kept ten minutes.

import { headers } from "next/headers";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { protocolForHref } from "@/lib/shared/protocols";
import { readPendleRoster } from "@/lib/sources/api/pendle";
import { toURLSearchParams, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { PendleRosterPage } from "@/lib/pendle/product";
import { PendleReadNotice } from "@/components/protocol/pendle/pendle-read-notice";

export const dynamic = "force-dynamic";

const PROTOCOL = protocolForHref("/ethereum/pendle")!;

export const metadata = listingMetadata({
  title: "Pendle markets on Ethereum",
  canonicalPath: "/ethereum/pendle/markets",
  description:
    "Every Pendle market on Ethereum the routers have named: its implied APY, pool and maturity read at one block, grouped by the protocol behind its yield-bearing token.",
});

export default async function PendleMarketsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const initialSearch = toURLSearchParams(await searchParams).toString();
  const ip = readerIpFromRequest({ headers: await headers() });
  const read = await readPendleRoster(ip);
  const at = Math.floor(Date.now() / 1000);
  if (!read.ok)
    return (
      <div className="min-h-screen">
        <div className="py-8">
          <SubPageHeader protocol={PROTOCOL} title="Markets" />
          <PendleReadNotice failure={read} />
        </div>
      </div>
    );
  return (
    <>
      <PendleRosterPage roster={read.data} at={at} initialSearch={initialSearch} />
      {/* The inspector, armed from the profile menu's switch. */}
      <ProvInspectorLayer />
    </>
  );
}
