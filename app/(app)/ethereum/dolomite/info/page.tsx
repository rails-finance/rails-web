// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("dolomite");

const intro = (
  <>
    <p>
      Dolomite is a margin-lending protocol built on dYdX&apos;s Solo Margin design. A user&apos;s funds live in
      numbered accounts: balances inside one account back each other, while the same owner&apos;s other accounts stand
      alone, margined and liquidated separately. There is no separate borrow action — an account that owes a token
      simply holds a negative balance in it.
    </p>
    <p>
      Each row of the listing is one account (an owner and an account number): what it holds, what it owes, and the
      margin line Dolomite&apos;s own risk engine holds it to — including the lower line some ETH-and-staked-ETH
      accounts get by an on-chain exception. Dollar values use Dolomite&apos;s own prices, the same ones it liquidates
      with. Or{" "}
      <Link href="/ethereum/dolomite/markets" className="text-blue-500 hover:underline">
        see every market and the margin ladder over it
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="dolomite">{intro}</ProtocolInfoPage>;
}
