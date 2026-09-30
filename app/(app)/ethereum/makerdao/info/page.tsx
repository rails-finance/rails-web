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
      MakerDAO renamed itself Sky in 2024: the same vault system, now minting USDS beside DAI. USDS and DAI are
      exchangeable one for one, both ways, through Sky&apos;s DAI–USDS converter.
    </p>
    <p>
      Vaults opened through Sky&apos;s LockStake Engine are listed here too, as urns (for example{" "}
      <Link
        href="/ethereum/makerdao/0xdfdb5d44f1c0b935c00e4fff6cbfd76c0db7e97c"
        className="text-blue-500 hover:underline"
      >
        this one
      </Link>
      ). The owner locks SKY and draws USDS through the engine, which makes a separate address, the urn, for the Vat to
      record the SKY and the debt under; an urn has no vault number. The engine stakes the locked SKY in a rewards farm
      the owner picks and passes its voting power to a delegate the owner picks, and the owner claims the farm&apos;s
      rewards; governance can set an exit fee on SKY taken out. Picking a farm or a delegate and claiming rewards are
      not shown here. Below the collateral type&apos;s minimum ratio (120% for LSEV2-SKY-A) an auction can sell the SKY,
      which the engine first takes out of the farm and back from the delegate. Each urn page says whether governance has
      these auctions switched on and what price cap it has set on SKY.
    </p>
    <p>
      Sky&apos;s savings are a separate explorer:{" "}
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
