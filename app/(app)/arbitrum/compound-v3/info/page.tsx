// About this explorer — the rail's (i) page.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("compound-v3-arbitrum");

const intro = (
  <>
    <p>
      Compound V3&rsquo;s Arbitrum deployment runs four markets, each its own world: one base asset that is both the
      lending side and the borrowing side, backed by a short roster of collateral assets, nothing shared between markets
      and nothing shared with the Ethereum or Base markets of the same names. The{" "}
      <Link href="/arbitrum/compound-v3/positions" className="text-blue-500 hover:underline">
        positions listing
      </Link>{" "}
      holds the positions Rails has read, from each day&rsquo;s most active wallets and any wallet a reader opened;
      enter any wallet on the{" "}
      <Link href="/arbitrum/compound-v3" className="text-blue-500 hover:underline">
        protocol page
      </Link>{" "}
      and every Comet is asked about it at one block, with dollar values from the feeds each Comet liquidates with. The
      WETH market prices in ETH; its dollar figures convert at the USDC market&rsquo;s WETH feed.
    </p>
    <p>
      A wallet&rsquo;s history comes from Rails&rsquo; store of the Comets&rsquo; logs, its body read from
      Etherscan&rsquo;s log index and checked against the chain through Tenderly. Under each timeline a line says how
      far that check has reached; until it agrees, the lifetime figures and the lifetime flows wait for it.
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="compound-v3-arbitrum">{intro}</ProtocolInfoPage>;
}
