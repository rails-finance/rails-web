// Alchemix V3 on Base — what the alUSDb line can say about its own figures.
// Server-rendered: a read-only statement with nothing to hydrate.

import { AlchemixLinesPanel } from "@/components/protocol/alchemix/alchemix-lines-panel";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { ALCHEMIX_BASE } from "@/lib/alchemix/lines";
import { alchemixLinesPageData } from "@/lib/alchemix/lines-page-data";
import { protocolForHref } from "@/lib/shared/protocols";
import { unlaunchedRobotsForPath } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Alchemix Lines",
  description:
    "The alUSDb line, and what it can say about its own figures — this line has had no redemption, so a position's debt is replayed from its own events.",
  ...unlaunchedRobotsForPath(`${ALCHEMIX_BASE.basePath}/lines`),
};

const PROTOCOL = protocolForHref(ALCHEMIX_BASE.basePath)!;

export default async function AlchemixBaseLinesPage() {
  const lines = await alchemixLinesPageData(ALCHEMIX_BASE);
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader protocol={PROTOCOL} title="Lines" />
        <AlchemixLinesPanel lines={lines} />
      </div>
    </div>
  );
}
