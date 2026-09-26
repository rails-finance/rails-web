// Alchemix V3 on Ethereum — what the alUSD and alETH lines can say about their
// own figures. Server-rendered: a read-only statement with nothing to hydrate.

import { AlchemixLinesPanel } from "@/components/protocol/alchemix/alchemix-lines-panel";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { ALCHEMIX_ETHEREUM } from "@/lib/alchemix/lines";
import { alchemixLinesPageData } from "@/lib/alchemix/lines-page-data";
import { protocolForHref } from "@/lib/shared/protocols";
import { unlaunchedRobotsForPath } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Alchemix Lines",
  description:
    "The alUSD and alETH lines, and what each can say about its own figures — whether a position's debt is replayed from its events or read from the contract at a block.",
  ...unlaunchedRobotsForPath(`${ALCHEMIX_ETHEREUM.basePath}/lines`),
};

const PROTOCOL = protocolForHref(ALCHEMIX_ETHEREUM.basePath)!;

export default async function AlchemixEthereumLinesPage() {
  const lines = await alchemixLinesPageData(ALCHEMIX_ETHEREUM);
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader protocol={PROTOCOL} title="Lines" />
        <AlchemixLinesPanel lines={lines} />
      </div>
    </div>
  );
}
