// Alchemix V3 on Ethereum — what the alUSD and alETH lines can say about their
// own figures. Server-rendered: a read-only statement with nothing to hydrate.

import {
  AlchemixCoverageGroup,
  AlchemixLinesPanel,
  AlchemixTransmuterCoveragePanel,
  AlchemixV2CoveragePanel,
} from "@/components/protocol/alchemix/alchemix-lines-panel";
import { SubPageHeader } from "@/components/shared/sub-page-header";
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
  title: "Alchemix Lines",
  description:
    "The alUSD and alETH lines, their Transmuters and the closed V2 record, and what each can say about its own figures — whether a position's debt is replayed from its events or read from the contract at a block.",
  ...unlaunchedRobotsForPath(`${ALCHEMIX_ETHEREUM.basePath}/lines`),
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
        <SubPageHeader protocol={PROTOCOL} title="Lines" />
        <AlchemixCoverageGroup title="Alchemist positions">
          <AlchemixLinesPanel lines={lines} />
        </AlchemixCoverageGroup>
        <AlchemixCoverageGroup title="Transmuter positions">
          <AlchemixTransmuterCoveragePanel lines={transmuter} />
        </AlchemixCoverageGroup>
        <AlchemixCoverageGroup title="V2 positions">
          <AlchemixV2CoveragePanel lines={v2} />
        </AlchemixCoverageGroup>
      </div>
    </div>
  );
}
