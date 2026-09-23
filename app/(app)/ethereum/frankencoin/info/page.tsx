// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("frankencoin");

const intro = (
  <>
    <p>
      Frankencoin is a Swiss-franc stablecoin (ZCHF) minted against collateral, with no price oracle anywhere in the
      system. Each minting position is its own small contract that the borrower owns. The one price a position carries
      is the liquidation price its owner declared — kept honest by challenge auctions: anyone who thinks a declared
      price is too high can post collateral and force an auction to test it.
    </p>
    <p>
      Each row of the listing is one position: its ZCHF debt, its collateral in the position&apos;s own token, its
      declared liquidation price, and any challenge currently running against it. No dollar figure or health factor
      appears because neither exists on chain. The protocol-level picture — the franc&apos;s supply, the equity and
      reserve capital behind it, the base rate, and the whole challenge record — lives on the{" "}
      <Link href="/ethereum/frankencoin/system" className="text-blue-500 hover:underline">
        system view
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="frankencoin">{intro}</ProtocolInfoPage>;
}
