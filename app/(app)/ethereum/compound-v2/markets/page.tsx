// Compound V2 protocol view (/compound-v2/markets) — every market the
// Comptroller lists and the state of the money in it, read live at one head
// block. This is the `views` cell of Compound V2's row.
//
// It sits ALONGSIDE the position explorer rather than instead of it, the same
// shape as /aave-v3/market, /morpho/markets and /fluid/vaults: the explorer
// answers "what happened to this wallet", this answers "what is the protocol".
// This page reads no index — it is one head-block read of the protocol's own
// contracts, and stays that way when the explorer lands.
//
// ⚠️ /compound-v2 (the explorer listing) does not exist yet — the onboard that
// builds it is in flight. Nothing here may link to it until it does, and the
// roster entry points at THIS page meanwhile (see lib/shared/protocols.ts).
//
// The claim it makes is Compound V2's own condition: the money is parked. $106M
// supplied against $12.4M borrowed, two markets carrying 94.5% of the borrowing
// that remains, and 8 of the 20 already switched off as collateral. That is why
// every bar sits nearly empty against its own rate model's kink.
//
// Server-rendered: a read-only aggregate with no interactivity to hydrate for,
// so the first paint carries the real figures (the Fluid vaults view's posture).

import {
  CompoundV2MarketsView,
  CompoundV2MarketsStamp,
} from "@/components/protocol/compound-v2/compound-v2-markets-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadCompoundV2Markets } from "@/lib/sources/chain/compound-v2-markets";
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
  title: "Compound V2 Markets",
  description:
    "Every Compound V2 market: what it holds, how little of it is borrowed, and which markets no longer back borrowing at all.",
};

const PROTOCOL = protocolForHref("/ethereum/compound-v2")!;

export default async function CompoundV2MarketsPage() {
  // Straight to the loader rather than through this deployment's own
  // /api/chain/compound-v2/markets route — same code, one less hop on the server.
  const data = await loadCompoundV2Markets();

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Markets & the money parked in them"
          stamp={<CompoundV2MarketsStamp data={data} />}
        />

        <div data-skel-section="page-table">
          <CompoundV2MarketsView data={data} />
        </div>
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
