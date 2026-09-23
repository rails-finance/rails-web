// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("morpho");

const intro = (
  <>
    <p>
      Morpho Blue is one contract holding thousands of independent lending markets. A market is defined once and never
      changes: one loan token, one collateral token, one oracle, and one loan-to-value number that is both the borrow
      limit and the liquidation line. Everything in a market is measured in its loan token.
    </p>
    <p>
      Each row of the listing is one position — a market and a borrower — with its collateral, its borrowed principal,
      and its status. No dollar value appears anywhere: Morpho itself never states one, and adding one would assume the
      loan token is worth $1 — an assumption the contracts never make. The listing filters by market, loan token or
      collateral token and searches by wallet or market name. Or{" "}
      <Link href="/ethereum/morpho/markets" className="text-blue-500 hover:underline">
        see the markets, loan token by loan token, and the one number that governs each
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="morpho">{intro}</ProtocolInfoPage>;
}
