// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("compound-v2");

const intro = (
  <>
    <p>
      Compound V2 is the original pooled-lending protocol, running since 2019. Suppliers deposit a token into a shared
      market and receive cTokens, receipts whose exchange rate for the token rises as borrowers pay interest. Borrowers
      draw from those markets against their deposits in the others.
    </p>
    <p>
      Governance has since set every market&apos;s reserve factor to 100%: all the interest borrowers pay goes to the
      market&apos;s reserves, suppliers earn nothing, and the exchange rate no longer rises. Sixteen markets moved to
      100% in one governance transaction on 8 Dec 2025 (block 23,969,453); SAI, REP, the older WBTC market and FEI got
      there earlier.
    </p>
    <p>
      Each row of the listing is one wallet&apos;s full history: what it supplied and borrowed across every market, and
      where it stands now. A liquidation repays at most half of one debt at a time, so a liquidated account often
      survives it; every seizure is shown leg by leg. The listing&apos;s &ldquo;Liquidated before&rdquo; filter finds
      every wallet liquidated at least once, open or closed, and its &ldquo;Liquidated&rdquo; status the ones that have
      since closed. Or{" "}
      <Link href="/ethereum/compound-v2/markets" className="text-blue-500 hover:underline">
        see all twenty markets and how little of them is borrowed today
      </Link>
      .
    </p>
    <p>
      Three markets have a fixed price set by governance: the oracle stores a number with no live feed behind it (the
      legacy SAI market&apos;s says $14.43 for a token that targeted a dollar). They are flagged wherever they appear.
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="compound-v2">{intro}</ProtocolInfoPage>;
}
