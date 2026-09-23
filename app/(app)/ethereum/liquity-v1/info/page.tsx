// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("liquity-v1");

const intro = (
  <>
    <p>
      Liquity V1 is the original interest-free borrowing protocol: ETH collateral, LUSD debt, a one-time fee instead of
      an interest rate, and no per-borrower settings at all. Redemptions — the mechanism that holds LUSD at a dollar —
      pay off the Troves with the lowest collateral ratio first.
    </p>
    <p>
      Each row of the listing is one Trove (a collateralised loan): its ETH collateral, its exact LUSD debt, and its
      status. Open Troves show by default — clearing the Status filter brings back six years of closed and liquidated
      history. Or see the{" "}
      <Link href="/ethereum/liquity-v1/system" className="text-blue-500 hover:underline">
        system state and redemption queue
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="liquity-v1">{intro}</ProtocolInfoPage>;
}
