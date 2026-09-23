// Liquity V2 protocol view (/liquity-v2/branches) — the three collateral
// branches (WETH / wstETH / rETH) side by side, read live from the branches'
// own contracts at one head block. This is the reference deployment's branch
// page, the sibling of /ebisu/branches and /asymmetry/branches: V2 is the
// architecture those forks copy, so it renders through the SAME shared
// LiquityForkBranchesView, parameterized for V2's own truth — three branches,
// BOLD as the debt token, and the three listing selections that reproduce a
// branch's redemption queue (collateralTypes / active / interestRate), each
// named differently here than on the forks.
//
// Server-rendered: a read-only aggregate with no interactivity to hydrate for,
// so the first paint carries real figures (the fork listings' SSR posture). The
// body is wrapped in <ProvSource> so every receipt cites the one head block it
// was read at.

import {
  LiquityForkBranchesView,
  LiquityForkBranchesStamp,
} from "@/components/protocol/liquity-fork/liquity-fork-branches-view";
import { ProvSource } from "@/components/shared/provenance";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadLiquityForkBranchesFromChain } from "@/lib/sources/chain/liquity-fork-branches";
import type { LiquityForkConfig, LiquityForkBranchConfig } from "@/lib/sources/chain/liquity-fork-position";
import { LIQUITY_V2_BRANCHES, DEBT_SYMBOL } from "@/lib/liquity/asset-catalog";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { protocolForHref } from "@/lib/shared/protocols";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "Liquity V2 Branches",
  canonicalPath: "/ethereum/liquity-v2/branches",
  description:
    "Liquity V2's three collateral branches and the order redemption reaches them — each branch with its own oracle, minimum collateral ratio and terms.",
});

const CFG: LiquityForkConfig = {
  protocol: "liquity-v2",
  debtSymbol: DEBT_SYMBOL,
  branches: LIQUITY_V2_BRANCHES as Record<string, LiquityForkBranchConfig>,
};

const PROTOCOL = protocolForHref("/ethereum/liquity-v2")!;

export default async function LiquityV2BranchesPage() {
  // Read straight from the loader rather than through this deployment's own
  // /api/chain/liquity-v2/branches route — same code, one less hop on the server.
  const data = await loadLiquityForkBranchesFromChain(CFG);

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Branches & how redemption reaches them"
          stamp={<LiquityForkBranchesStamp data={data} />}
        />

        {/* Every value inside registers its receipt against this one head block —
            the same block the stamp above names. */}
        <div data-skel-section="page-table">
          <ProvSource source={{ block: data.blockNumber }}>
            <LiquityForkBranchesView
              data={data}
              protocolName="Liquity V2"
              basePath="/ethereum/liquity-v2"
              urls={{ filterParam: "collateralTypes", openStatus: "active", rateSort: "interestRate" }}
              learnMore={{
                protocolName: "Liquity V2",
                stablecoin: DEBT_SYMBOL,
                docsLink: { label: "Liquity docs", url: "https://docs.liquity.org" },
              }}
            />
          </ProvSource>
        </div>
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
