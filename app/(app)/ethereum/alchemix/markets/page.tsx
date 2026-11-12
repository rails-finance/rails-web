// Alchemix V3 on Ethereum — what the alUSD and alETH markets can say about their
// own figures. Server-rendered; under Focus the markets in focus show (alchemix-lines-focus.tsx).

import { AlchemixLinesFocus } from "@/components/protocol/alchemix/alchemix-lines-focus";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { ALCHEMIX_HOW_IT_WORKS } from "@/lib/alchemix/learn-more";
import { ALCHEMIX_ETHEREUM } from "@/lib/alchemix/lines";
import {
  alchemixLinesPageData,
  alchemixTransmuterCoveragePageData,
  alchemixV2CoveragePageData,
} from "@/lib/alchemix/lines-page-data";
import { protocolForHref } from "@/lib/shared/protocols";
import { unlaunchedRobotsForPath } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Alchemix markets",
  description:
    "The alUSD and alETH markets, their Transmuters and the closed V2 record, and what each can say about its own figures, whether a position's debt is replayed from its events or read from the contract at a block.",
  ...unlaunchedRobotsForPath(`${ALCHEMIX_ETHEREUM.basePath}/markets`),
};

const PROTOCOL = protocolForHref(ALCHEMIX_ETHEREUM.basePath)!;

export default async function AlchemixEthereumLinesPage() {
  // Each position type states its own coverage: the Alchemist row's grade and
  // redemptions say nothing about a Transmuter position or a V2 account.
  const [lines, transmuter, v2] = await Promise.all([
    alchemixLinesPageData(ALCHEMIX_ETHEREUM),
    alchemixTransmuterCoveragePageData(ALCHEMIX_ETHEREUM),
    alchemixV2CoveragePageData(ALCHEMIX_ETHEREUM),
  ]);
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader protocol={PROTOCOL} title="Markets" learnMore={ALCHEMIX_HOW_IT_WORKS} />
        <AlchemixLinesFocus catalog={ALCHEMIX_ETHEREUM.lines} lines={lines} transmuter={transmuter} v2={v2} />
      </div>
    </div>
  );
}
