// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("maple");

const intro = (
  <>
    <p>
      Maple runs an institutional lending desk. Depositors supply USDC or USDT, and Maple lends it to trading firms and
      funds against collateral held by custodians like BitGo and Anchorage. A loan is either fixed-term, running to a
      maturity date, or open-term, with no maturity date and a call Maple can make with notice; the pools page shows the
      split, and both pools here lend on open terms today. The borrowers&apos; interest is where a lender&apos;s yield
      comes from. A depositor holds syrupUSDC or syrupUSDT, a share token whose exit rate, the amount one share pays out
      on withdrawal, rises as that interest accrues.
    </p>
    <p>
      Each position listed is one wallet&apos;s stake in a pool: what its shares are worth to exit today, and where it
      stands in the withdrawal queue. Exits are queued rather than instant because most of the pool is out on loan — the
      band at the top of the listing shows how much is liquid right now against how much is deployed.
    </p>
    <p>
      One caveat carries through every figure. The chain records what Maple&apos;s contracts booked: principal lent, the
      rate posted, and any loan the pool delegate (the manager that runs the pool&apos;s lending) has marked as
      impaired. It does not prove that the custodied collateral behind those loans exists. That last step rests on
      Maple&apos;s custodians, off-chain. Amounts stay in the pool&apos;s asset; a stablecoin is never counted as a
      dollar. Or{" "}
      <Link href="/ethereum/maple/pools" className="text-blue-500 hover:underline">
        see the pools and what lenders can reach
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="maple">{intro}</ProtocolInfoPage>;
}
