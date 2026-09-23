// Morpho protocol view (/ethereum/morpho/markets) — the roster at a glance, one
// row per loan token, each token's state read live from the singleton at one
// head block. Server-rendered: the figures are the page, so the first paint
// carries them rather than a skeleton (the posture every chain-lane view here
// takes).
//
// Two pages, not one: this overview draws no market rows at all. Each loan
// token's markets live at /ethereum/morpho/markets/<loan token>, where the
// USDC roster's 464-market dust tail is one disclosure rather than 464 rows.

import { MorphoMarketsOverview, MorphoMarketsStamp } from "@/components/protocol/morpho/morpho-markets-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadMorphoMarketsFromChain } from "@/lib/sources/chain/morpho-markets";
import { overviewData, stampOf } from "@/lib/morpho/markets-shape";
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
  title: "Morpho Blue Markets",
  description:
    "Every Morpho Blue market, one row per loan token — what it is lent against, how much, how used, and the one loan-to-value that governs each market.",
};

const PROTOCOL = protocolForHref("/ethereum/morpho")!;

export default async function MorphoMarketsPage() {
  // Straight to the loader rather than through this deployment's own /api/chain/morpho/markets
  // route — same code, one less hop on the server.
  const data = await loadMorphoMarketsFromChain();

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Markets & the one number that governs them"
          stamp={<MorphoMarketsStamp data={stampOf(data)} />}
        />

        <MorphoMarketsOverview data={overviewData(data)} />
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
