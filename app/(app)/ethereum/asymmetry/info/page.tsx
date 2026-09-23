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
      Each row of the listing is one Trove: its collateral, its USDaf debt, the rate its owner chose, and its status.
      Collateral ratios and dollar values are off by default — Asymmetry states amounts in each Trove&apos;s own tokens,
      and those extra figures are conversions layered on top. Or{" "}
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
