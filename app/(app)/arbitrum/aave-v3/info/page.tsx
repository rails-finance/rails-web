// About this explorer — the rail's (i) page.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("aave-v3-arbitrum");

const intro = (
  <>
    <p>
      Aave V3&rsquo;s Arbitrum deployment: one Pool, every reserve, one health factor per wallet, separate from the
      Ethereum market of the same name. The{" "}
      <Link href="/arbitrum/aave-v3/positions" className={INLINE_LINK}>
        positions listing
      </Link>{" "}
      holds the positions Rails has read, from each day&rsquo;s most active wallets and any wallet a reader opened;
      enter any wallet on the{" "}
      <Link href="/arbitrum/aave-v3" className={INLINE_LINK}>
        protocol page
      </Link>{" "}
      and its account is read from the Pool at the head, with dollar values from the oracle the Pool liquidates with.
    </p>
    <p>
      A wallet&rsquo;s history comes from Rails&rsquo; store of the Pool&rsquo;s logs, its body read from
      Etherscan&rsquo;s log index and checked against the chain through Tenderly. Under each timeline a line says how
      far that check has reached; until it agrees, the highest balances, the lifetime flows and the interest figures
      wait for it.
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="aave-v3-arbitrum">{intro}</ProtocolInfoPage>;
}
