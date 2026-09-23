// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("liquity-v2");

const intro = (
  <>
    <p>
      Liquity V2 issues BOLD, a dollar-tracking stablecoin borrowed against three collateral types — WETH, wstETH and
      rETH — each running as its own branch. A borrower opens a Trove (a collateralised loan) and sets their own
      interest rate; paying a higher rate pushes the Trove further back in the redemption queue that holds BOLD at a
      dollar.
    </p>
    <p>
      Each row of the listing is one Trove: its collateral, its BOLD debt, its owner&apos;s rate, and its status —
      active, zombie (redeemed down below the minimum debt), closed or liquidated. Dollar values use Liquity&apos;s own
      oracle prices. The listing searches by wallet, ENS name or Trove ID. Or{" "}
      <Link href="/ethereum/liquity-v2/branches" className="text-blue-500 hover:underline">
        compare the branches and their redemption queues
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="liquity-v2">{intro}</ProtocolInfoPage>;
}
