// Compound V3 on Optimism — the markets (/optimism/compound-v3/markets), archetype
// A1 on the shared product shell (lib/compound/product.tsx), the shape Ethereum,
// Base and Arbitrum draw: one head per Comet, each opening its page. The figures
// are rails-server's read of every Comet at the head (/api/at-block/
// compound-v3-optimism/markets, held 30 s there).

import { CompoundMarketsOverview } from "@/lib/compound/product";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { fetchCompoundV3OptimismMarkets } from "@/lib/api/fetch-compound-v3-optimism";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "Compound V3 on Optimism · Markets",
  canonicalPath: "/optimism/compound-v3/markets",
  description:
    "The 3 Compound V3 markets on Optimism, read from the Comets when the page opens: each one's size, rates, utilization, reserves and collateral.",
});

export default async function Page() {
  const data = await fetchCompoundV3OptimismMarkets();
  return (
    <>
      <CompoundMarketsOverview data={data} chain="optimism" />
      {/* The inspector, armed from the profile menu's switch. */}
      <ProvInspectorLayer />
    </>
  );
}
