// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { BaseLendingCoverageNote } from "@/components/shared/base-lending-coverage-banner";

export const metadata = infoMetadata("moonwell-base");

const intro = (
  <>
    <p>
      Moonwell is a Compound V2 fork, and Base is where it actually runs: twenty-one markets under one Comptroller,
      every one of them cross-collateralised with the rest, so a wallet has one standing across all of them rather than
      a position per market.
    </p>
    <p>
      Each row of the listing is one wallet&apos;s account: what it supplies and what it owes across every market, each
      figure read from that market&apos;s own contract at the block the row names, and dollar values from the oracle the
      Comptroller itself liquidates with, read at that same block. Opening a row shows the wallet with its whole
      history. Or{" "}
      <Link href="/base/moonwell/markets" className="text-blue-500 hover:underline">
        see every market and how heavily it is lent out
      </Link>
      .
    </p>
    <BaseLendingCoverageNote route="/api/moonwell-base/coverage" unreadListed={false} />
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="moonwell-base">{intro}</ProtocolInfoPage>;
}
