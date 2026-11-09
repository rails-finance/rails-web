// Compound V3 on Ethereum: the markets (/ethereum/compound-v3/markets), archetype A1 on
// the shared product shell (rails-ops ui-jobs 549/550; decision 0059): one head
// per Comet, each opening the Comet's page (/ethereum/compound-v3/markets/<comet>).
// The figures are one pinned-block read of every Comet; lib/compound/product.tsx
// maps them into the model.
//
// ISR, ten minutes: a protocol aggregate serves every visitor the same render,
// and each head's read stamp states the time of the read behind it.

import { CompoundMarketsOverview } from "@/lib/compound/product";
import { compoundMarketsMetadata, loadComets } from "@/lib/compound/product-routes";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const revalidate = 600;

export const metadata = compoundMarketsMetadata("ethereum");

export default async function CompoundMarketsRoute() {
  const data = await loadComets("ethereum");
  return (
    <>
      <CompoundMarketsOverview data={data} chain="ethereum" />
      {/* Each section arms the inspector from its ⋮; no page-wide toggle. */}
      <ProvInspectorLayer />
    </>
  );
}
