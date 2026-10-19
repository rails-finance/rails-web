// When an Aave V3 Arbitrum history counts as a whole life: no holes, from the
// Pool's first block, and confirmed by a second chain witness (rails-ops
// TO-DO-arbitrum-scoping.md §7 item 1). Read by the page and the share card.

import type { ChainTimelineCoverage } from "@/lib/api/fetch-chain-timeline";

export function aaveV3ArbitrumWholeLife(coverage: ChainTimelineCoverage): boolean {
  return (
    coverage.gaps.length === 0 && coverage.fromDeployment === true && coverage.confirmation?.status === "confirmed"
  );
}
