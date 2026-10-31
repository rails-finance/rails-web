// About this explorer — the rail's (i) page.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("morpho-arbitrum");

const intro = (
  <>
    <p>
      Morpho Blue&rsquo;s Arbitrum deployment: one singleton holding 258 independent lending markets, each one loan
      token, one collateral token, one oracle and one loan-to-value number that is both the borrow limit and the
      liquidation line. The{" "}
      <Link href="/arbitrum/morpho/positions" className={INLINE_LINK}>
        positions listing
      </Link>{" "}
      holds the positions Rails has read, from each day&rsquo;s most active wallets and any wallet a reader opened;
      enter any wallet on the{" "}
      <Link href="/arbitrum/morpho" className={INLINE_LINK}>
        protocol page
      </Link>{" "}
      and every market is asked what it holds for that wallet, all at one block. Every figure is in the market&rsquo;s
      loan token; the wallet&rsquo;s dollar totals convert it at the Aave V3 Arbitrum oracle&rsquo;s price, where that
      oracle lists the token.
    </p>
    <p>
      A wallet&rsquo;s history comes from Rails&rsquo; store of the singleton&rsquo;s logs, its body read from
      Etherscan&rsquo;s log index and checked against the chain through Tenderly. Under each timeline a line says how
      far that check has reached; until it agrees, the position cards and the lifetime flows wait for it.
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="morpho-arbitrum">{intro}</ProtocolInfoPage>;
}
