// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("spark");

const intro = (
  <>
    <p>
      SparkLend is a pooled lending market built on Aave V3&apos;s design, part of the Sky (formerly MakerDAO)
      ecosystem. Suppliers deposit assets to earn interest; borrowers draw other assets against those deposits as
      collateral, and all of a wallet&apos;s positions back each other.
    </p>
    <p>
      Each row of the listing is one wallet&apos;s account: everything it supplies, everything it owes, and its health
      factor — the single number that decides when an account can be liquidated. Dollar values use SparkLend&apos;s own
      prices, the same ones it liquidates with. Or{" "}
      <Link href="/ethereum/spark/market" className="text-blue-500 hover:underline">
        compare the market&apos;s reserves
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="spark">{intro}</ProtocolInfoPage>;
}
