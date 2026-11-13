// Compound V3 on Arbitrum: the markets (/arbitrum/compound-v3/markets), archetype A1 on
// the shared product shell (rails-ops ui-jobs 549/550; decision 0059): one head
// per Comet, each opening the Comet's page (/arbitrum/compound-v3/markets/<comet>).
// The figures are one pinned-block read of every Comet; lib/compound/product.tsx
// maps them into the model.
//
// ISR, ten minutes: a protocol aggregate serves every visitor the same render,
// and each head's read stamp states the time of the read behind it.

import { CompoundMarketsOverview } from "@/lib/compound/product";
import { compoundMarketsMetadata, loadComets } from "@/lib/compound/product-routes";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const revalidate = 600;

export const metadata = compoundMarketsMetadata("arbitrum");

export default async function CompoundArbitrumMarketsRoute() {
  const data = await loadComets("arbitrum");
  return (
    <>
      <CompoundMarketsOverview data={data} chain="arbitrum" />
      {/* The inspector, armed from the profile menu's switch. */}
      <ProvInspectorLayer />
    </>
  );
}
