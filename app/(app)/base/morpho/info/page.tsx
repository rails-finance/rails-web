// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { BaseLendingCoverageNote } from "@/components/shared/base-lending-coverage-banner";

export const metadata = infoMetadata("morpho-base");

const intro = (
  <>
    <p>
      Morpho Blue is one contract holding thousands of independent lending markets, and on Base it holds two and a half
      times as many as on Ethereum. A market is defined once and never changes: one loan token, one collateral token,
      one oracle, and one loan-to-value number that is both the borrow limit and the liquidation line. Everything in a
      market is measured in its loan token.
    </p>
    <p>
      Each row of the listing is one position — a market and a borrower — with the collateral it holds and the debt it
      owes, each read from the contract&apos;s own storage at the block the row names, and beside them what the
      market&apos;s own oracle made of that collateral at the same moment. No dollar value appears anywhere: Morpho
      itself never states one. Opening a row shows that position — its economics and its whole history — with the
      wallet&apos;s other positions one link away. Or{" "}
      <Link href="/base/morpho/markets" className="text-blue-500 hover:underline">
        see the markets, loan token by loan token, and the one number that governs each
      </Link>
      .
    </p>
    <BaseLendingCoverageNote
      route="/api/morpho-base/coverage"
      unreadListed={false}
      subject="the singleton"
      subjectPossessive="the singleton&rsquo;s"
      noun="position"
    />
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="morpho-base">{intro}</ProtocolInfoPage>;
}
