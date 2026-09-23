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
      Each row of the listing is one Trove: its collateral, its ebUSD debt, the rate its owner chose, and its status.
      Collateral ratios and dollar values are off by default — Ebisu states amounts in each Trove&apos;s own tokens, and
      those extra figures are conversions layered on top. Or{" "}
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
