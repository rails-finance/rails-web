// Ebisu protocol view (/ebisu/branches) — the five collateral branches side by
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
import { EBISU_BRANCHES, DEBT_SYMBOL } from "@/lib/ebisu/asset-catalog";
import { protocolForHref } from "@/lib/shared/protocols";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ebisu Branches",
  description:
    "Ebisu's five collateral branches and the order redemption reaches them — each branch with its own oracle, minimum collateral ratio and terms.",
};

const CFG: LiquityForkConfig = { protocol: "ebisu", debtSymbol: DEBT_SYMBOL, branches: EBISU_BRANCHES };

const PROTOCOL = protocolForHref("/ethereum/ebisu")!;

export default async function EbisuBranchesPage() {
  // Read straight from the loader rather than through this deployment's own
  // /api/chain/ebisu/branches route — same code, one less hop on the server.
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
          protocolName="Ebisu"
          basePath="/ethereum/ebisu"
          learnMore={{
            protocolName: "Ebisu",
            stablecoin: DEBT_SYMBOL,
            // The one live-verified Ebisu link (docs.ebisu.money doesn't
            // answer) — the same one the event cards carry.
            docsLink: { label: "Ebisu", url: "https://ebisu.money" },
          }}
        />
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
