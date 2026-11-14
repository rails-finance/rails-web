// Alchemix V3 on Base — what the alUSDb market can say about its own figures.
// Server-rendered; under Focus the markets in focus show (alchemix-lines-focus.tsx).

import { AlchemixLinesFocus } from "@/components/protocol/alchemix/alchemix-lines-focus";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { ALCHEMIX_HOW_IT_WORKS } from "@/lib/alchemix/learn-more";
import { ALCHEMIX_BASE } from "@/lib/alchemix/lines";
import { alchemixLinesPageData, alchemixTransmuterCoveragePageData } from "@/lib/alchemix/lines-page-data";
import { protocolForHref } from "@/lib/shared/protocols";
import { unlaunchedRobotsForPath } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Alchemix markets",
  description:
    "The alUSDb market and its Transmuter, and what each can say about its own figures, this market has had no redemption, so a position's debt is replayed from its own events.",
  ...unlaunchedRobotsForPath(`${ALCHEMIX_BASE.basePath}/markets`),
};

const PROTOCOL = protocolForHref(ALCHEMIX_BASE.basePath)!;

export default async function AlchemixBaseLinesPage() {
  // Each position type states its own coverage: the Alchemist row's grade and
  // redemptions say nothing about a Transmuter position.
  const [lines, transmuter] = await Promise.all([
    alchemixLinesPageData(ALCHEMIX_BASE),
    alchemixTransmuterCoveragePageData(ALCHEMIX_BASE),
  ]);
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader protocol={PROTOCOL} title="Markets" learnMore={ALCHEMIX_HOW_IT_WORKS} />
        <AlchemixLinesFocus catalog={ALCHEMIX_BASE.lines} lines={lines} transmuter={transmuter} />
      </div>
    </div>
  );
}
