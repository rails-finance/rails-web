"use client";

// Seamless — the market overview (/base/seamless/market). The explorer's front
// door is the listing at /base/seamless since 2026-08-25; this page is the
// Pool's reserve roster, the /ethereum/aave-v3/market shape.
//
// The market is CLOSED. Every one of the eighteen reserves was frozen in a
// single block on 15 April 2025, so nothing below is an invitation: the rates
// are live, the risk parameters are enforced, and no new position can be
// taken. An explorer that showed borrow APRs on a market nobody can borrow
// from without saying so would be technically true and practically a lie.

import { AaveMarketPage } from "@/components/shared/aave-market-page";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { BASE_CHAIN_ID, explorerUrl } from "@/lib/shared/chains";
import { SEAMLESS_FREEZE_BLOCK, SEAMLESS_FREEZE_DATE, SEAMLESS_FREEZE_TX } from "@/lib/seamless/asset-catalog";
import { aaveMarketOverviewContent } from "@/lib/shared/learn-more-content";

export default function SeamlessMarketPage() {
  return (
    <>
      <div className="pt-8">
        <div className="rounded-xl bg-raised p-4">
          <p className="max-w-3xl text-[13px] leading-relaxed text-foreground">
            <span className="font-medium">This market is closed to new positions.</span>{" "}
            <span className="text-rb-500">
              All eighteen reserves were frozen in{" "}
              <a
                href={explorerUrl(BASE_CHAIN_ID, "tx-logs", SEAMLESS_FREEZE_TX)}
                target="_blank"
                rel="noopener noreferrer"
                className="link-external"
              >
                one transaction
              </a>{" "}
              at block {SEAMLESS_FREEZE_BLOCK.toLocaleString("en-US")}, {SEAMLESS_FREEZE_DATE} — eighteen{" "}
              <span className="font-mono text-[12px]">ReserveFrozen</span> events, and none undone since. A frozen
              reserve still accrues interest, still liquidates, and still lets a holder repay and withdraw; what it will
              not accept is a new supply or a new borrow. So every rate and every risk parameter below is live and
              enforced, and none of it is an invitation.
            </span>
          </p>
        </div>
      </div>

      <AaveMarketPage
        protocol="seamless"
        chainId={BASE_CHAIN_ID}
        apiRoute="/api/chain/seamless/market"
        listingHref="/base/seamless"
        protocolName="Seamless"
        marketLabel="Seamless · Base"
        purpose="An Aave V3 fork on Base with its own Pool, reserves, risk parameters and oracle — frozen since April 2025 and winding down."
        learnMore={aaveMarketOverviewContent("seamless")}
      />
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </>
  );
}
