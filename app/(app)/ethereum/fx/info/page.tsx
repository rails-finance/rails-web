// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("fx");

const intro = (
  <>
    <p>
      f(x) Protocol V2 offers leveraged positions on wstETH and WBTC, funded by fxUSD debt. The protocol does not act on
      positions one at a time: funding fees, rebalances and liquidations consume whole ticks — narrow buckets of
      positions grouped by debt ratio — and a position is shares in its tick.
    </p>
    <p>
      Each row of the listing is one position (an NFT): its collateral, its fxUSD debt, and its standing after every
      tick-wide event that touched it. Debt stays stated as fxUSD — it is never assumed to be a dollar. Or{" "}
      <Link href="/ethereum/fx/pools" className="text-blue-500 hover:underline">
        see the pools and their tick ladders
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="fx">{intro}</ProtocolInfoPage>;
}
