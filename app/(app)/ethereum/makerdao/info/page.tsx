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
      the collateral ratio beside each debt divides into it. Maker states the price and the debt; the ratio is ours,
      drawn from nothing else. The listing filters by collateral type and searches by wallet or vault number. Or see{" "}
      <Link href="/ethereum/makerdao/system" className="text-blue-500 hover:underline">
        the Vat&apos;s balance sheet, decomposed by collateral type
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="makerdao">{intro}</ProtocolInfoPage>;
}
