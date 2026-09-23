// Polaris protocol view (/sepolia/polaris/markets) — the two markets side by
// side, read live at one Sepolia head block plus the index's replayed book.
// Server-rendered: a read-only aggregate with no interactivity to hydrate for,
// so the first paint carries real figures.
//
// The static `markets` segment sits beside the [market]/[id] route — Next
// resolves static before dynamic, and neither market is literally "markets".

import { PolarisMarketsView, PolarisMarketsStamp } from "@/components/protocol/polaris/polaris-markets-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadPolarisMarketsFromChain } from "@/lib/sources/chain/polaris-position";
import { loadPolarisBook } from "@/lib/sources/api/polaris-book";
import { protocolForHref } from "@/lib/shared/protocols";
import { POLARIS_BASE_PATH } from "@/lib/polaris/routes";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

// Read live on every request: the stamp says "chain snapshot · block N", and
// that is only true of a page rendered for the visitor looking at it. The cost
// is bounded elsewhere — loadPolarisMarketsFromChain() memoises the board for
// 60 s per server instance (lib/sources/chain/polaris-position.ts), so a live
// page costs at most one multicall a minute whatever the traffic. The nearer
// Suspense boundary is ./loading.tsx, sized for this two-card shape.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Polaris Markets",
  description:
    "Polaris's two Sepolia markets side by side — collateral and debt, the algorithmic rate in force, mode and reserve ratio, the stability pools, and the price legs the protocol values pETH with.",
};

const PROTOCOL = protocolForHref(POLARIS_BASE_PATH)!;

export default async function PolarisMarketsPage() {
  const [chain, book] = await Promise.all([loadPolarisMarketsFromChain(), loadPolarisBook()]);
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader protocol={PROTOCOL} title="Markets" stamp={<PolarisMarketsStamp chain={chain} />} />
        {/* data-skel-section feeds the skeleton memory layer, so ./loading.tsx
            paints this region at the height it was last measured at. */}
        <div data-skel-section="page-table">
          <PolarisMarketsView chain={chain} book={book} />
        </div>
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
