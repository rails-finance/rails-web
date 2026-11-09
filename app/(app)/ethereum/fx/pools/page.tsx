// f(x)'s pools (/ethereum/fx/pools), archetype A1 on the shared product shell
// (rails-ops ui-jobs 549/550; decision 0059): one head per pool, each opening
// the pool's page (/ethereum/fx/pools/<pool>). "Pools" is f(x)'s noun. The
// figures are one pinned-block read of both pools; lib/fx/product.tsx maps
// them into the model. The static `pools` segment sits beside `[position]`;
// Next resolves static before dynamic, so a position slug never shadows it.
//
// ISR, ten minutes: a protocol aggregate serves every visitor the same render,
// and each head's read stamp states the time of the read behind it.

import { FxPoolsOverview } from "@/lib/fx/product";
import { fxRosterData } from "@/lib/fx/product-data";
import { loadFxSystemFromChain } from "@/lib/sources/chain/fx-system";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const revalidate = 600;

export const metadata = {
  title: "f(x) pools",
  description:
    "f(x) V2's two pools on Ethereum, wstETH and WBTC: their collateral, fxUSD debt, funding rate, debt ratio and the lines their keepers act from.",
};

export default async function FxPoolsRoute() {
  const data = await loadFxSystemFromChain();
  return (
    <>
      <FxPoolsOverview data={fxRosterData(data)} />
      {/* Each section arms the inspector from its ⋮; no page-wide toggle. */}
      <ProvInspectorLayer />
    </>
  );
}
