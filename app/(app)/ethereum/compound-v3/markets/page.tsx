// Compound V3 protocol view (/compound/markets) — each Comet market's own
// state, read live at one head block. This is the `views` cell of Compound
// V3's row.
//
// It sits ALONGSIDE the position explorer rather than instead of it, the same
// shape as /compound-v2/markets, /aave-v3/market, /morpho/markets and
// /fluid/vaults: the explorer answers "what happened to this wallet", this
// answers "what is the protocol". This page reads no index — it is one
// head-block read of each market's own Comet contract.
//
// The route is plural (/compound/markets, like /compound-v2/markets and
// /morpho/markets) because Compound V3 IS several markets: each Comet is one
// base asset with its own collateral roster, its own rate curve and its own
// reserve line, and nothing is cross-collateralised between them. /aave-v3's
// view is singular (/aave-v3/market) for the opposite reason — one Pool.
//
// Server-rendered: a read-only aggregate with no interactivity to hydrate for,
// so the first paint carries the real figures (the Compound V2 view's posture).

import { CompoundMarketsView, CompoundMarketsStamp } from "@/components/protocol/compound/compound-markets-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadCompoundV3Markets } from "@/lib/sources/chain/compound-markets";
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
  title: "Compound V3 Markets",
  description:
    "Each Compound V3 market's own state — how heavily it is lent out against its rate-model kink, with rates, supply caps and reserves.",
};

const PROTOCOL = protocolForHref("/ethereum/compound-v3")!;

export default async function CompoundMarketsPage() {
  // Straight to the loader rather than through this deployment's own
  // /api/chain/compound/markets route — same code, one less hop on the server.
  const data = await loadCompoundV3Markets();

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Markets & the state of each one"
          stamp={<CompoundMarketsStamp data={data} />}
        />

        <div data-skel-section="page-table">
          <CompoundMarketsView data={data} />
        </div>
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
