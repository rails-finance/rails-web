// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("llamalend");

const intro = (
  <>
    <p>
      LlamaLend is Curve&apos;s lending protocol, and its liquidation is a band rather than a line. Each market is
      isolated — one collateral token, one borrowed token — and holds its collateral in an AMM across a range of prices.
      When the price falls into a position&apos;s band, the AMM converts its collateral to the borrowed token
      continuously: soft-liquidation, a state a position lives in rather than an event that ends it.
    </p>
    <p>
      Each row of the listing is one position — a market and a borrower — showing its collateral, its debt, and how much
      of the collateral currently stands converted. Or{" "}
      <Link href="/ethereum/llamalend/markets" className="text-blue-500 hover:underline">
        see every market and its own terms
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="llamalend">{intro}</ProtocolInfoPage>;
}
