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
      is the liquidation price its owner declared, and challenge auctions test it: anyone who thinks a declared price is
      too high can post collateral and force an auction.
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
    <p>
      A position&apos;s own page opens on a card: what the position holds and owes now, its declared price, its interest
      rate and its expiry, with a plain-language explanation behind the info button. Lifetime flows add up the ZCHF it
      has minted and repaid and the collateral it has deposited and withdrawn. The timeline lists every event, newest
      first; one transaction can record several. Open an event for its figures before and after, and for a mint or a
      repayment the ZCHF the wallet received or paid. Its info button says what happened in words, and its ? explains
      that kind of event, with the Frankencoin docs pages it rests on. The debt is always the gross amount minted: the
      wallet receives less, because the reserve share and the interest for the remaining term are taken at minting.
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="frankencoin">{intro}</ProtocolInfoPage>;
}
