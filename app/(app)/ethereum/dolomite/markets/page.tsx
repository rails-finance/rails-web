// Dolomite's markets page (/ethereum/dolomite/markets), archetype A2 on the
// shared product shell (rails-ops ui-jobs 549/550; decision 0059): Dolomite is
// one pool, so its Markets tab opens the market page directly. The figures are
// one head-block read of DolomiteMargin; lib/dolomite/product.tsx maps them
// into the model.
//
// Server-rendered: the first paint carries the figures. ISR, ten minutes: a
// protocol aggregate serves every visitor the same render, and the head's read
// stamp states the time of the read behind a cached page.

import { DolomiteMarketsPage } from "@/lib/dolomite/product";
import { loadDolomiteMarkets } from "@/lib/sources/chain/dolomite-markets";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const revalidate = 600;

export const metadata = {
  title: "Dolomite markets",
  description: "Every Dolomite market on Ethereum: its size, rates, price and collateral terms.",
};

export default async function DolomiteMarketsRoute() {
  const data = await loadDolomiteMarkets();
  return (
    <>
      <DolomiteMarketsPage data={data} />
      {/* Each section arms the inspector from its ⋮; no page-wide toggle. */}
      <ProvInspectorLayer />
    </>
  );
}
