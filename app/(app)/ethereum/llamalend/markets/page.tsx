// LlamaLend protocol view (/llamalend/markets) — every market the three
// factories list, read live at one head block. This is the `views` cell of
// LlamaLend's row.
//
// It sits ALONGSIDE the position explorer rather than instead of it, the same
// shape as /dolomite/markets and /compound-v2/markets: the explorer answers
// "what happened to this position", this answers "what is the protocol".
// This page reads no index — it is one head-block read of the factories' and
// markets' own contracts, and stays that way when the explorer's backend
// lands.
//
// The claim it makes is LlamaLend's own risk geometry: liquidation is a BAND,
// not a line — each market's amplification A sets how gradually the AMM
// converts collateral inside it — and the borrowed token is crvUSD on most
// markets (~$1, so figures read as dollars) but NOT all, and the exceptions
// are named rather than smoothed.
//
// Server-rendered: a read-only aggregate with no interactivity to hydrate
// for, so the first paint carries the real figures.

import { LlamalendMarketsView, LlamalendMarketsStamp } from "@/components/protocol/llamalend/llamalend-markets-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadLlamalendMarkets } from "@/lib/sources/chain/llamalend-markets";
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
  title: "LlamaLend Markets",
  description:
    "Every LlamaLend market across Curve's factories — amplification, discounts, live rates, utilisation and each AMM's own oracle.",
};

const PROTOCOL = protocolForHref("/ethereum/llamalend")!;

export default async function LlamalendMarketsPage() {
  // Straight to the loader rather than through this deployment's own
  // /api/chain/llamalend/markets route — same code, one less hop on the server.
  const data = await loadLlamalendMarkets();

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Markets & the band geometry over them"
          stamp={<LlamalendMarketsStamp data={data} />}
        />

        <div data-skel-section="page-table">
          <LlamalendMarketsView data={data} />
        </div>
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
