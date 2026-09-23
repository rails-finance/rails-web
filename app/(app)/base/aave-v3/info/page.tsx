// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { BaseLendingCoverageNote } from "@/components/shared/base-lending-coverage-banner";

export const metadata = infoMetadata("aave-v3-base");

const intro = (
  <>
    <p>
      Aave V3&rsquo;s Base deployment: one Pool, every reserve, one health factor per wallet — a separate market from
      the Ethereum one of the same name, with its own reserves, its own risk parameters and its own oracle. Each row of
      the listing is one wallet&apos;s account: what it holds, what it owes, and how far it sits from liquidation —
      every figure read from the Pool itself at the block the row names, and dollar values from the oracle the Pool
      liquidates with. Or{" "}
      <Link href="/base/aave-v3/market" className="text-blue-500 hover:underline">
        see the reserves and the risk parameters the Pool enforces
      </Link>
      .
    </p>
    <BaseLendingCoverageNote route="/api/aave-v3-base/coverage" />
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="aave-v3-base">{intro}</ProtocolInfoPage>;
}
