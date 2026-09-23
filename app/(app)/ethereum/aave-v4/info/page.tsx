// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("aave-v4");

const intro = (
  <>
    <p>
      Aave V4 is the newest version of Aave&apos;s pooled lending market, rebuilt as hubs and spokes: liquidity sits in
      central hubs, and spokes — the markets users actually touch — hold collateral and draw borrowing power from a hub.
      Suppliers earn interest on deposits; borrowers draw assets against collateral, and a wallet&apos;s positions
      within one spoke back each other.
    </p>
    <p>
      Each row of the listing is one wallet&apos;s account in one spoke: supplied and borrowed balances, and the health
      factor — the number that decides when an account can be liquidated. Dollar values use Aave&apos;s own prices, the
      same ones it liquidates with. The listing searches by wallet or ENS name and filters by hub, spoke, asset or
      status. Or{" "}
      <Link href="/ethereum/aave-v4/hubs" className="text-blue-500 hover:underline">
        see the hubs and their credit lines
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="aave-v4">{intro}</ProtocolInfoPage>;
}
