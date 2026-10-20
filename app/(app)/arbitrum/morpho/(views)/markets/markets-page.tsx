"use client";

// Morpho Blue on Arbitrum — the market overview (/arbitrum/morpho/markets):
// the census's markets read live. The server half, page.tsx beside this
// file, carries the metadata.

import { SubPageHeader } from "@/components/shared/sub-page-header";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { MorphoArbitrumMarketsView } from "@/components/protocol/morpho/morpho-arbitrum-markets-view";
import { protocolForSession } from "@/lib/shared/protocols";

const PROTOCOL = protocolForSession("morpho-arbitrum")!;

export function MorphoArbitrumMarketsPage() {
  return (
    <>
      <div className="py-8">
        <SubPageHeader protocol={PROTOCOL} title="Market overview" />
        <MorphoArbitrumMarketsView />
      </div>
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </>
  );
}
