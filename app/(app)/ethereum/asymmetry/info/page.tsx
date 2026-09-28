// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("asymmetry");

const intro = (
  <>
    <p>
      Asymmetry Finance issues USDaf, a dollar-tracking stablecoin that is borrowed into existence. A borrower opens a
      Trove — a collateralised loan — against one of seven collateral types (yield-bearing stablecoins and wrapped
      bitcoin) and sets their own interest rate. Paying a higher rate buys protection: redemptions, the mechanism that
      holds USDaf at a dollar by paying off the lowest-rate loans first, reach those Troves last.
    </p>
    <p>
      A redemption that cancels enough debt to drop a Trove below its branch&apos;s 2,000 USDaf minimum turns it into a
      zombie: pulled out of the rate-ordered redemption queue and placed first in line the next time redemptions reach
      the branch, until the owner borrows it back above the floor.
    </p>
    <p>
      A borrower can delegate their rate to a batch manager instead of setting it themselves — the manager then sets and
      moves the rate for every Trove in the batch at once, one delegated decision managing many Troves&apos; place in
      the redemption queue.
    </p>
    <p>
      Opening a Trove sets aside a fixed 0.0375 WETH liquidation reserve, apart from the collateral: it funds the gas
      paid to whoever liquidates the Trove, and comes back to the owner when the Trove closes.
    </p>
    <p>
      Each row of the listing is one Trove: its collateral, its USDaf debt, its collateral ratio, its dollar value, the
      rate its owner or their batch manager set, and its status. Or{" "}
      <Link href="/ethereum/asymmetry/branches" className="text-blue-500 hover:underline">
        compare the branches and their redemption queues
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="asymmetry">{intro}</ProtocolInfoPage>;
}
