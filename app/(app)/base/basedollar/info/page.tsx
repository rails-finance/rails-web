// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("basedollar");

const intro = (
  <>
    <p>
      Basedollar issues BD, a dollar-tracking stablecoin borrowed against five collateral types: ether (WETH), staked
      ether (wstETH, rETH and cbETH) and wrapped bitcoin (wcbBTC). A borrower opens a Trove — a collateralised loan —
      and sets their own interest rate; paying a higher rate pushes the Trove further from redemptions, the mechanism
      that holds BD at a dollar by paying off the lowest-rate loans first.
    </p>
    <p>
      Each row of the listing is one Trove: its collateral, its BD debt, its collateral ratio and dollar value at the
      branch&apos;s price today, the rate its owner chose, and its status. Or{" "}
      <Link href="/base/basedollar/branches" className="text-blue-500 hover:underline">
        compare the branches and their redemption queues
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="basedollar">{intro}</ProtocolInfoPage>;
}
