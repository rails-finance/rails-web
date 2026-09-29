// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("makerdao");

const intro = (
  <>
    <p>
      MakerDAO is the system that mints DAI: a borrower locks collateral in a vault and draws new DAI against it, paying
      a stability fee whose rate governance sets per collateral type. When a vault falls below its collateral
      type&apos;s minimum ratio, it is liquidated at auction.
    </p>
    <p>
      Each row of the listing is one vault: its collateral, its DAI debt with accrued fees, and its status. Dollar
      values use the protocol&apos;s own price feeds — the same delayed oracles Maker itself acts on, and the same ones
      the collateral ratio beside each debt divides into it. The listing filters by collateral type and searches by
      wallet or vault number. Or see{" "}
      <Link href="/ethereum/makerdao/system" className="text-blue-500 hover:underline">
        the balance sheet of the Vat
      </Link>{" "}
      (Maker&apos;s core accounting contract, where every vault&apos;s collateral and debt is recorded), split by
      collateral type.
    </p>
    <p>
      Each vault page follows one vault: the card states its{" "}
      <Link href="/ethereum/makerdao/14012" className="text-blue-500 hover:underline">
        collateral, debt with the stability fee in it, and collateral ratio
      </Link>{" "}
      and who owns it; Lifetime flows adds up what went in and out; the timeline lists every event, with{" "}
      <Link href="/ethereum/makerdao/24785" className="text-blue-500 hover:underline">
        what a liquidation&apos;s auction sold and handed back
      </Link>{" "}
      and{" "}
      <Link href="/ethereum/makerdao/3772" className="text-blue-500 hover:underline">
        who the vault passed to
      </Link>
      .
    </p>
    <p>
      MakerDAO renamed itself Sky in 2024: the same vault system, now minting USDS beside DAI, so vaults opened through
      Sky&apos;s LockStake engine are listed here too. Its savings are a separate explorer:{" "}
      <Link href="/ethereum/sky-savings" className="text-blue-500 hover:underline">
        Sky Savings
      </Link>{" "}
      lists every address holding sUSDS, with the interest each has earned.
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="makerdao">{intro}</ProtocolInfoPage>;
}
