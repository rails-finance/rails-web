"use client";

// Aave V3 on Arbitrum — the protocol page (/arbitrum/aave-v3). Position-first
// (rails-ops TO-DO-arbitrum-scoping.md §7 item 2): the rail header, a wallet
// input that opens the position page, and the Pool's market overview under it.

import { RailHeader } from "@/components/shared/rail-header";
import { WalletLookup } from "@/components/shared/wallet-lookup";
import { AaveMarketPage } from "@/components/shared/aave-market-page";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { ARBITRUM_CHAIN_ID } from "@/lib/shared/chains";
import { aaveV3MarketModal } from "@/lib/aave-v3/event-templates";

export function AaveV3ArbitrumProtocolPage() {
  return (
    <>
      <div className="py-8">
        <header className="mb-10">
          <div className="mb-6">
            <RailHeader session="aave-v3-arbitrum" venue="listing" stamp />
          </div>
          <p className="mb-3 text-sm text-rb-500">
            Open any wallet&rsquo;s account on this Pool, read live from the chain, with its history.
          </p>
          <WalletLookup
            placeholder="Wallet address or ENS name"
            positionHref={(wallet) => `/arbitrum/aave-v3/${wallet}`}
          />
        </header>
        <AaveMarketPage
          header="section"
          protocol="aave-v3-arbitrum"
          chainId={ARBITRUM_CHAIN_ID}
          apiRoute="/api/chain/aave-v3-arbitrum/market"
          listingHref="/arbitrum/aave-v3"
          protocolName="Aave V3"
          marketLabel="Aave V3 · Arbitrum"
          purpose="Aave V3's Arbitrum deployment: its own Pool, its own reserves and its own risk parameters, separate from the Ethereum market of the same name."
          learnMore={aaveV3MarketModal("aave-v3-arbitrum")}
        />
      </div>
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </>
  );
}
