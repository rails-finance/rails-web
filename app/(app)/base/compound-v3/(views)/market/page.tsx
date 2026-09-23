// Compound V3 on Base — the market overview (/base/compound-v3/market). The
// explorer's front door is the listing at /base/compound-v3 since 2026-08-26;
// this page is the protocol view beside it, the /ethereum/compound-v3/markets
// shape: every Comet governance deployed here with its size, utilisation, rate
// kinks and collateral factors, read live from the contracts.
//
// Server-rendered: a read-only aggregate with no interactivity to hydrate for,
// so the first paint carries the real figures.

import { CompoundMarketsView, CompoundMarketsStamp } from "@/components/protocol/compound/compound-markets-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadCompoundV3Markets } from "@/lib/sources/chain/compound-markets";
import { COMPOUND_BASE_CHAIN_ID, COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";
import { protocolForHref } from "@/lib/shared/protocols";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

// ISR, ten minutes. This is a protocol aggregate, not a wallet's page: the
// same render serves every visitor, so re-reading the contracts per request
// bought nothing but RPC. Ten minutes is roughly fifty blocks of interest
// accrual on figures quoted to the nearest percent. The header stamp names the
// block the read happened at, so a cached page states its own age.
export const revalidate = 600;

const PROTOCOL = protocolForHref("/base/compound-v3")!;

export default async function CompoundBaseMarketPage() {
  // Straight to the reader rather than through this deployment's own
  // /api/chain/compound-base/markets route — same code, one less hop.
  const data = await loadCompoundV3Markets(COMPOUND_BASE_DEPLOYMENT);
  const s = data.summary;

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Markets & the state of each one"
          stamp={
            <CompoundMarketsStamp
              data={data}
              chainId={COMPOUND_BASE_CHAIN_ID}
              rosterNote={
                <>
                  the roster is the{" "}
                  <span className="text-foreground">{s.total} Comets Compound governance deployed here</span> — Comet
                  exposes no call that enumerates its markets, so a roster is always stated, and on this chain a name
                  will not do it: four different proxies answer to cUSDCv3 and only one is Compound&rsquo;s. The five
                  below are the ones its own Configurator deployed
                </>
              }
            />
          }
        />

        <div data-skel-section="page-table">
          <CompoundMarketsView data={data} chainId={COMPOUND_BASE_CHAIN_ID} />
        </div>
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
