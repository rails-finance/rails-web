// Dolomite protocol view (/dolomite/markets) — every market the core lists
// and the risk ladder over them, read live at one head block. This is the
// `views` cell of Dolomite's row.
//
// It sits ALONGSIDE the position explorer rather than instead of it, the same
// shape as /compound-v2/markets, /morpho/markets and /fluid/vaults: the
// explorer answers "what happened to this account", this answers "what is the
// protocol". This page reads no index — it is one head-block read of the
// core's own contract, and stays that way when the explorer's backend lands.
//
// The claim it makes is Dolomite's own risk posture: 117.65% minimum
// collateralisation at the base, scaled up MULTIPLICATIVELY by per-market
// margin premiums (WLFI's 27.5% premium lands at ≈150.0%), with an
// account-level carve-out — the LST/ETH override at 111.11% — stated rather
// than smoothed, because rendering the ladder as universal would misstate
// every overridden account.
//
// Server-rendered: a read-only aggregate with no interactivity to hydrate
// for, so the first paint carries the real figures.

import { DolomiteMarketsView, DolomiteMarketsStamp } from "@/components/protocol/dolomite/dolomite-markets-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadDolomiteMarkets } from "@/lib/sources/chain/dolomite-markets";
import { protocolForHref } from "@/lib/shared/protocols";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

// ISR, ten minutes. This is a protocol aggregate, not a wallet's page: the
// same render serves every visitor, so re-reading the contracts per request
// bought nothing but RPC. Ten minutes is roughly fifty blocks of interest
// accrual on figures quoted to the nearest percent. The header stamp names the
// block the read happened at, so a cached page states its own age.
export const revalidate = 600;

export const metadata = {
  title: "Dolomite Markets",
  description:
    "Every Dolomite market and the protocol's own margin ladder over it — premiums, live rates and its own oracle prices.",
};

const PROTOCOL = protocolForHref("/ethereum/dolomite")!;

export default async function DolomiteMarketsPage() {
  // Straight to the loader rather than through this deployment's own
  // /api/chain/dolomite/markets route — same code, one less hop on the server.
  const data = await loadDolomiteMarkets();

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Markets & the risk ladder over them"
          stamp={<DolomiteMarketsStamp data={data} />}
        />

        <div data-skel-section="page-table">
          <DolomiteMarketsView data={data} />
        </div>
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
