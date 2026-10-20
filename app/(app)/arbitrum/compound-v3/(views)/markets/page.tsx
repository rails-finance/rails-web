// Compound V3 on Arbitrum — the market overview (/arbitrum/compound-v3/markets):
// the four Comets read live, the /base/compound-v3/market shape with the
// Arbitrum roster.

import { CompoundMarketsView, CompoundMarketsStamp } from "@/components/protocol/compound/compound-markets-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { protocolForSession } from "@/lib/shared/protocols";
import { loadCompoundV3Markets } from "@/lib/sources/chain/compound-markets";
import { COMPOUND_ARBITRUM_CHAIN_ID, COMPOUND_ARBITRUM_DEPLOYMENT } from "@/lib/compound-arbitrum/asset-catalog";

export const metadata = listingMetadata({
  title: "Compound V3 on Arbitrum · Market overview",
  canonicalPath: "/arbitrum/compound-v3/markets",
  description:
    "The four Comets Compound governance deployed on Arbitrum, read live at one block: each one's base asset, collateral roster, rate curve and reserve line.",
});

// ISR, ten minutes, as the Base market page: one render serves every visitor,
// and the stamp names the block the read happened at.
export const revalidate = 600;

const PROTOCOL = protocolForSession("compound-v3-arbitrum")!;

export default async function CompoundArbitrumMarketsPage() {
  const data = await loadCompoundV3Markets(COMPOUND_ARBITRUM_DEPLOYMENT);

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Markets & the state of each one"
          stamp={
            <CompoundMarketsStamp
              data={data}
              chainId={COMPOUND_ARBITRUM_CHAIN_ID}
              rosterNote={
                <>
                  The roster is the{" "}
                  <span className="text-foreground">{data.summary.total} Comets Compound governance deployed here</span>{" "}
                  — Comet exposes no call that enumerates its markets, so a roster is always stated. These are the four
                  in the comet repository&rsquo;s Arbitrum deployments, each answering to the same governor on chain
                </>
              }
            />
          }
        />
        <div data-skel-section="page-table">
          <CompoundMarketsView data={data} chainId={COMPOUND_ARBITRUM_CHAIN_ID} />
        </div>
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
