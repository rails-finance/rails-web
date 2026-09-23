// f(x) V2 protocol view (/fx/pools) — the two AaveFundingPools and their tick
// ladders, read live at one pinned block. "Pools" is the protocol's own noun:
// the PoolManager registers pools (RegisterPool), and each pool owns its tick
// tree, its oracle and its funding engine — there is no other system-level
// unit to name the route after. The static `pools` segment sits beside
// `[position]`; Next resolves static before dynamic, so a position slug can
// never shadow it.

import { FxSystemView, FxSystemStamp } from "@/components/protocol/fx/fx-system-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadFxSystemFromChain } from "@/lib/sources/chain/fx-system";
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
  title: "f(x) Pools",
  description:
    "f(x) V2's two pools and their tick ladders: every tick holding debt, checked against each pool's own totals exactly, and the funding state that moves them all.",
};

const PROTOCOL = protocolForHref("/ethereum/fx")!;

export default async function FxPoolsPage() {
  // Straight to the loader rather than through this deployment's own
  // /api/chain/fx/pools route — same code, one less hop on the server.
  const data = await loadFxSystemFromChain();

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="The pools & their tick ladders"
          stamp={<FxSystemStamp data={data} />}
        />

        <FxSystemView data={data} />
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
