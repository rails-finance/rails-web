// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("ebisu");

const intro = (
  <>
    <p>
      Ebisu Money issues ebUSD, a dollar-tracking stablecoin borrowed against five collateral types — staked ether,
      yield-bearing stablecoins and wrapped bitcoin. A borrower opens a Trove — a collateralised loan — and sets their
      own interest rate; paying a higher rate pushes the Trove further from redemptions, the mechanism that holds ebUSD
      at a dollar by paying off the lowest-rate loans first.
    </p>
    <p>
      Each branch sets its own minimum collateral ratio, below which anyone can liquidate a Trove: 120% for weETH and
      WBTC, 115% for sUSDe and stcUSD, 135% for LBTC. Ebisu&apos;s governance can move it — weETH&apos;s was 128% and
      WBTC&apos;s 132% until 4 January 2026. A past liquidation is shown against the minimum in force at its block.
    </p>
    <p>
      A liquidated Trove&apos;s debt is offset first by its branch&apos;s Stability Pool — ebUSD deposited by other
      users, who receive the seized collateral at a discount — and redistributed across the branch&apos;s other Troves
      for whatever the pool can&apos;t cover.
    </p>
    <p>
      Drawing new ebUSD, whether at open or on a later adjustment, pays a one-time upfront fee: a week of interest on
      the new debt at the branch&apos;s average rate, added to the debt.
    </p>
    <p>
      Each row of the listing is one Trove: its collateral, its ebUSD debt, its collateral ratio, its dollar value, the
      rate its owner chose, and its status. Or{" "}
      <Link href="/ethereum/ebisu/branches" className="text-blue-500 hover:underline">
        compare the branches and their redemption queues
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="ebisu">{intro}</ProtocolInfoPage>;
}
