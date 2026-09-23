// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { BaseLendingCoverageNote } from "@/components/shared/base-lending-coverage-banner";
import { BASE_CHAIN_ID, explorerUrl } from "@/lib/shared/chains";
import { SEAMLESS_FREEZE_BLOCK, SEAMLESS_FREEZE_DATE, SEAMLESS_FREEZE_TX } from "@/lib/seamless/asset-catalog";

export const metadata = infoMetadata("seamless");

const intro = (
  <>
    <p>
      Seamless is an Aave V3 market on Base, winding down. One Pool, every reserve, one health factor per wallet. Each
      row of the listing is one wallet&apos;s account: what it still holds, what it still owes, and how far it sits from
      liquidation — every figure read from the Pool itself at the block the row names, and dollar values from the oracle
      the Pool liquidates with.
    </p>
    <p>
      <span className="font-medium text-foreground">This market is closed to new positions.</span> All eighteen reserves
      were frozen in{" "}
      <a
        href={explorerUrl(BASE_CHAIN_ID, "tx-logs", SEAMLESS_FREEZE_TX)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        one transaction
      </a>{" "}
      at block {SEAMLESS_FREEZE_BLOCK.toLocaleString("en-US")}, {SEAMLESS_FREEZE_DATE}. A frozen reserve still accrues
      interest, still liquidates, and still lets a holder repay and withdraw — so the open positions here are real and
      moving, and none of them can grow. Or{" "}
      <Link href="/base/seamless/market" className="text-blue-500 hover:underline">
        see the reserves and what the Pool still enforces
      </Link>
      .
    </p>
    <BaseLendingCoverageNote route="/api/seamless/coverage" />
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="seamless">{intro}</ProtocolInfoPage>;
}
