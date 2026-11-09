"use client";

// Seamless — the market overview (/base/seamless/markets). The explorer's front
// door is the listing at /base/seamless since 2026-08-25; this page is the
// Pool's reserve roster, the /ethereum/aave-v3/markets shape.
//
// The market is CLOSED. Every one of the eighteen reserves was frozen in a
// single block on 15 April 2025, so nothing below is an invitation: the rates
// are live, the risk parameters are enforced, and no new position can be
// taken. An explorer that showed borrow APRs on a market nobody can borrow
// from without saying so would be technically true and practically a lie.

import { AaveMarketPage } from "@/lib/aave-family/product";
import { SEAMLESS_MARKET } from "@/lib/shared/aave-market-configs";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { SEAMLESS_FREEZE_DATE } from "@/lib/seamless/asset-catalog";

export default function SeamlessMarketPage() {
  return (
    <>
      <div className="pt-8">
        <div className="rounded-xl bg-raised p-4">
          <p className="max-w-3xl text-[13px] leading-relaxed text-foreground">
            <span className="font-medium">This market is closed to new positions.</span>{" "}
            <span className="text-rb-500">
              All eighteen reserves were frozen together on {SEAMLESS_FREEZE_DATE}, and none has been unfrozen since. A
              frozen reserve still accrues interest, still liquidates, and still lets a holder repay and withdraw; what
              it will not accept is a new supply or a new borrow. So every rate and every risk parameter below is live
              and enforced, and none of it is an invitation.
            </span>
          </p>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500">
            SEAM, DEGEN and BRETT have no market price here: the Pool&rsquo;s oracle returns a fixed $1.00 for each, so
            the page shows their size in tokens and leaves them out of the dollar totals. None of the three is
            collateral. The reserves whose names start with r (rWETH, rwstETH, rweETH, rUSDC, rcbBTC) are what their
            contracts call Seamless ILM Reserved tokens, one each for WETH, wstETH, weETH, USDC and cbBTC; ILM is
            Seamless&rsquo;s name for its leverage strategies. The oracle prices each at its underlying asset.
          </p>
        </div>
      </div>

      <AaveMarketPage market={SEAMLESS_MARKET} />
      {/* Each section arms the inspector from its ⋮; no page-wide toggle. */}
      <ProvInspectorLayer />
    </>
  );
}
