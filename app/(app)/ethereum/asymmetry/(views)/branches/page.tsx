// Asymmetry protocol view (/asymmetry/branches) — the seven collateral
// branches side by side, read live from the branches' own contracts at one
// head block. A branch's redemption queue is not listed here: it is the
// listing filtered to that branch and sorted by rate, which the page links into. Server-rendered: a read-only
// aggregate with no interactivity to hydrate for, so the first paint carries
// real figures. The same shared LiquityForkBranchesView Ebisu renders — the
// fork machinery is one implementation, parameterized.

import {
  LiquityForkBranchesView,
  LiquityForkBranchesStamp,
} from "@/components/protocol/liquity-fork/liquity-fork-branches-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadLiquityForkBranchesFromChain } from "@/lib/sources/chain/liquity-fork-branches";
import type { LiquityForkConfig } from "@/lib/sources/chain/liquity-fork-position";
import { ASYMMETRY_BRANCHES, DEBT_SYMBOL } from "@/lib/asymmetry/asset-catalog";
import { protocolForHref } from "@/lib/shared/protocols";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Asymmetry Branches",
  description:
    "Asymmetry's seven collateral branches and the order redemption reaches them — each branch with its own oracle, minimum collateral ratio and terms.",
};

const CFG: LiquityForkConfig = { protocol: "asymmetry", debtSymbol: DEBT_SYMBOL, branches: ASYMMETRY_BRANCHES };

const PROTOCOL = protocolForHref("/ethereum/asymmetry")!;

export default async function AsymmetryBranchesPage() {
  // Read straight from the loader rather than through this deployment's own
  // /api/chain/asymmetry/branches route — same code, one less hop on the server.
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
          protocolName="Asymmetry"
          basePath="/ethereum/asymmetry"
          learnMore={{
            protocolName: "Asymmetry",
            stablecoin: DEBT_SYMBOL,
            // The one live-verified Asymmetry link — the same one the event
            // cards carry.
            docsLink: { label: "Asymmetry docs", url: "https://docs.asymmetry.finance" },
          }}
        />
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
