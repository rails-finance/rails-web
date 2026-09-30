// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("pwn");

const intro = (
  <>
    <p>
      PWN is peer-to-peer lending on fixed terms: one lender, one borrower, collateral escrowed, and every term struck
      between the parties at origination: a repayment total on the SimpleLoan v1.1 contract, a yearly rate that accrues
      by the minute on v1.2 and v1.3. Only an extension moves the deadline. On v1.1 the LOAN note&rsquo;s holder moves
      it alone, to at most 30 days ahead each time, and nothing is paid for it; on v1.2 and v1.3 one party proposes an
      extension of 1 to 90 days and the other accepts it. The parties set the price between themselves, so the protocol
      has no oracle, no health factor and no liquidation — a loan past its deadline unpaid defaults, and the lender
      claims the collateral.
    </p>
    <p>
      Each row of the listing is one loan: its collateral, the principal advanced, what it owes, and its status. No
      dollar value appears because none exists in the protocol. Or{" "}
      <Link href="/ethereum/pwn/book" className="text-blue-500 hover:underline">
        see the whole loan book and what secures it
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="pwn">{intro}</ProtocolInfoPage>;
}
