// Moonwell on Base — the protocol view (/base/moonwell/markets): every market
// the Comptroller lists and the state of the money in it, read live at one
// head block. The `views` cell of the Moonwell Base row.
//
// It sits BESIDE the positions listing at /base/moonwell, the same shape as
// /ethereum/moonwell/markets: the listing answers "who holds what here", this
// answers "what is the protocol". Until 2026-08-26 this view was the
// explorer's front door with a wallet lookup above it, because no index stood
// behind the account set; the listing lane (rails-ops architecture/base-l2-
// lane.md §8) closed that gap and the lookup went with it.
//
// Server-rendered: a read-only aggregate with no interactivity to hydrate for,
// so the first paint carries the real figures.

import { MoonwellMarketsView, MoonwellMarketsStamp } from "@/components/protocol/moonwell/moonwell-markets-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadMoonwellMarkets } from "@/lib/sources/chain/moonwell-market-state";
import {
  MOONWELL_BASE_CHAIN_ID,
  MOONWELL_BASE_COMPTROLLER,
  MOONWELL_BASE_DEPLOYMENT,
} from "@/lib/moonwell-base/asset-catalog";
import { protocolForHref } from "@/lib/shared/protocols";
import { unlaunchedRobotsForPath } from "@/lib/shared/page-metadata";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

// ISR, ten minutes. This is a protocol aggregate, not a wallet's page: the
// same render serves every visitor, so re-reading the contracts per request
// bought nothing but RPC. Ten minutes is roughly fifty blocks of interest
// accrual on figures quoted to the nearest percent. The header stamp names the
// block the read happened at, so a cached page states its own age.
export const revalidate = 600;

export const metadata = {
  title: "Moonwell Markets on Base",
  description:
    "Every market on Moonwell's Base deployment — what it holds, how much of it is borrowed, and how far each sits below its cap.",
  ...unlaunchedRobotsForPath("/base/moonwell/markets"),
};

const PROTOCOL = protocolForHref("/base/moonwell")!;

export default async function MoonwellBaseMarketsPage() {
  // Straight to the reader rather than through this deployment's own
  // /api/chain/moonwell-base/markets route — same code, one less hop.
  const data = await loadMoonwellMarkets(MOONWELL_BASE_DEPLOYMENT);

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Markets & the money working in them"
          stamp={
            <MoonwellMarketsStamp
              data={data}
              chainId={MOONWELL_BASE_CHAIN_ID}
              comptroller={MOONWELL_BASE_COMPTROLLER}
            />
          }
        />

        <div data-skel-section="page-table">
          <MoonwellMarketsView
            data={data}
            chainId={MOONWELL_BASE_CHAIN_ID}
            comptroller={MOONWELL_BASE_COMPTROLLER}
            listingBasePath="/base/moonwell"
            listingFilterKey="mToken"
          />
        </div>
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
