// Basedollar protocol view (/basedollar/branches) — the five collateral branches side by
// side, read live from the branches' own contracts at one head block. A
// branch's redemption queue is not listed here: it is the listing filtered to
// that branch and sorted by rate, which the branch section links into. Server-rendered: this is a read-only aggregate
// with no interactivity to hydrate for, so the first paint carries the real
// figures rather than a skeleton (the fork listings' SSR posture). The shared
// LiquityForkBranchesView holds the presentation — Asymmetry renders the same
// component off its own roster.

import {
  LiquityForkBranchesView,
  LiquityForkBranchesStamp,
} from "@/components/protocol/liquity-fork/liquity-fork-branches-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadLiquityForkBranchesFromChain } from "@/lib/sources/chain/liquity-fork-branches";
import type { LiquityForkConfig } from "@/lib/sources/chain/liquity-fork-position";
import { BASEDOLLAR_BRANCHES, DEBT_SYMBOL } from "@/lib/basedollar/asset-catalog";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import { protocolForHref } from "@/lib/shared/protocols";
import { unlaunchedRobotsForPath } from "@/lib/shared/page-metadata";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Basedollar Branches",
  description:
    "Basedollar's five collateral branches and the order redemption reaches them — each branch with its own oracle, minimum collateral ratio and terms.",
  ...unlaunchedRobotsForPath("/base/basedollar/branches"),
};

// chainId is the load-bearing field here: these branch addresses exist on Base,
// and without it the loader would read Ethereum at the same addresses and
// return plausible nonsense rather than an error.
const CFG: LiquityForkConfig = {
  protocol: "basedollar",
  debtSymbol: DEBT_SYMBOL,
  branches: BASEDOLLAR_BRANCHES,
  chainId: BASE_CHAIN_ID,
};

const PROTOCOL = protocolForHref("/base/basedollar")!;

export default async function BasedollarBranchesPage() {
  // Read straight from the loader rather than through this deployment's own
  // /api/chain/basedollar/branches route — same code, one less hop on the server.
  const data = await loadLiquityForkBranchesFromChain(CFG);

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Branches & how redemption reaches them"
          stamp={<LiquityForkBranchesStamp data={data} />}
        />

        <LiquityForkBranchesView
          data={data}
          protocolName="Basedollar"
          basePath="/base/basedollar"
          learnMore={{
            protocolName: "Basedollar",
            stablecoin: DEBT_SYMBOL,
            // The one live-verified Basedollar link (docs.basedollar.money doesn't
            // answer) — the same one the event cards carry.
            docsLink: { label: "Basedollar", url: "https://basedollar.money" },
          }}
        />
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
