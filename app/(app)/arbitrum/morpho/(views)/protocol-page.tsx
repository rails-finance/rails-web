"use client";

// Morpho Blue on Arbitrum — the protocol page (/arbitrum/morpho). Position-first
// (rails-ops TO-DO-arbitrum-scoping.md item 13): the rail header, a wallet
// input that opens the wallet page, and the census's markets under it.

import { RailHeader } from "@/components/shared/rail-header";
import { WalletLookup } from "@/components/shared/wallet-lookup";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { MorphoArbitrumMarketsView } from "@/components/protocol/morpho/morpho-arbitrum-markets-view";
import { morphoArbitrumWalletHref } from "@/lib/morpho-arbitrum/routes";

export function MorphoArbitrumProtocolPage() {
  return (
    <>
      <div className="py-8">
        <header className="mb-10">
          <div className="mb-6">
            <RailHeader session="morpho-arbitrum" venue="listing" stamp />
          </div>
          <p className="mb-3 text-sm text-rb-500">
            Open any wallet&rsquo;s positions on this singleton, read live from the chain, with their history.
          </p>
          <WalletLookup placeholder="Wallet address or ENS name" positionHref={morphoArbitrumWalletHref} />
        </header>
        <MorphoArbitrumMarketsView />
      </div>
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </>
  );
}
