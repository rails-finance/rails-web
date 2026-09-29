// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { liquityV1AboutContent } from "@/lib/shared/learn-more-content";

export const metadata = infoMetadata("liquity-v1");

const intro = (
  <>
    <p>
      Liquity V1 is the original interest-free borrowing protocol. A borrower locks ETH in a Trove (a collateralised
      loan) and mints LUSD, a dollar stablecoin, against it, paying a one-time fee instead of interest. A Trove below a
      110% collateral ratio can be liquidated: the Stability Pool&apos;s LUSD cancels its debt and takes its ETH.
      Redemptions, which let anyone swap LUSD for $1 of ETH, reach the Troves with the lowest collateral ratio first. If
      all Troves together fall below 150%, the system enters Recovery Mode, where more Troves can be liquidated and
      borrowing is restricted.
    </p>
    <div className="flex items-center gap-2">
      <span className="font-medium text-foreground">About Liquity V1: terms and sources</span>
      <LearnMore inline content={liquityV1AboutContent()} />
    </div>
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
