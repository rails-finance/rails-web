"use client";

// Compound V3 on Arbitrum — the protocol page (/arbitrum/compound-v3).
// Position-first (rails-ops TO-DO-arbitrum-scoping.md item 12): the rail
// header, a wallet input that opens the wallet page, and the four Comets'
// market overview under it, the Base market view with the Arbitrum roster.

import { RailHeader } from "@/components/shared/rail-header";
import { WalletLookup } from "@/components/shared/wallet-lookup";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { CompoundMarketsView, CompoundMarketsStamp } from "@/components/protocol/compound/compound-markets-view";
import type { CompoundV3MarketsResponse } from "@/lib/sources/chain/compound-markets";
import { COMPOUND_ARBITRUM_CHAIN_ID } from "@/lib/compound-arbitrum/asset-catalog";
import { compoundArbitrumWalletHref } from "@/lib/compound-arbitrum/routes";

export function CompoundArbitrumProtocolPage({ data }: { data: CompoundV3MarketsResponse }) {
  return (
    <>
      <div className="py-8">
        <header className="mb-10">
          <div className="mb-6">
            <RailHeader session="compound-v3-arbitrum" venue="listing" stamp />
          </div>
          <p className="mb-3 text-sm text-rb-500">
            Open any wallet&rsquo;s positions in these four Comets, read live from the chain, with their history.
          </p>
          <WalletLookup placeholder="Wallet address or ENS name" positionHref={compoundArbitrumWalletHref} />
        </header>
        <section aria-labelledby="compound-markets-heading">
          <header className="mb-6" data-skel-section="page-header">
            <h2 id="compound-markets-heading" className="text-lg font-semibold text-foreground">
              Markets &amp; the state of each one
            </h2>
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
          </header>
          <div data-skel-section="page-table">
            <CompoundMarketsView data={data} chainId={COMPOUND_ARBITRUM_CHAIN_ID} />
          </div>
        </section>
      </div>
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </>
  );
}
