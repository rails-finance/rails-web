// Liquity V1 protocol view (/liquity-v1/system) — the one ETH market's state
// and its redemption queue, read live from the protocol's own contracts at one
// head block. Server-rendered: a read-only aggregate with no interactivity to
// hydrate for, so the first paint carries real figures.
//
// This is the Liquity family's V1 sibling of /ebisu/branches and
// /asymmetry/branches. It deliberately does NOT mirror their shape: V1 has one
// market (nothing to compare) and no user-set rates (nothing to order a queue
// by but the collateral ratio). See the view component for the adaptation.
//
// The static `system` segment sits beside the [wallet] one — Next resolves
// static before dynamic, and no wallet address is the literal string "system".

import { LiquityV1SystemView, LiquityV1SystemStamp } from "@/components/protocol/liquity-v1/liquity-v1-system-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadLiquityV1SystemFromChain } from "@/lib/sources/chain/liquity-v1-system";
import { protocolForHref } from "@/lib/shared/protocols";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

// ISR, ten minutes. This is a protocol aggregate, not a wallet's page: the
// same render serves every visitor, so re-reading the contracts per request
// bought nothing but RPC. Ten minutes is roughly fifty blocks of interest
// accrual on figures quoted to the nearest percent. The header stamp names the
// block the read happened at, so a cached page states its own age.
export const revalidate = 600;

export const metadata = {
  title: "Liquity V1 System",
  description:
    "Liquity V1's system state and redemption queue — total collateral ratio, the Stability Pool, and the base rate.",
};

const PROTOCOL = protocolForHref("/ethereum/liquity-v1")!;

export default async function LiquityV1SystemPage() {
  // Read straight from the loader rather than through this deployment's own
  // /api/chain/liquity-v1/system route — same code, one less hop on the server.
  const data = await loadLiquityV1SystemFromChain();

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="System & redemption queue"
          stamp={<LiquityV1SystemStamp data={data} />}
        />

        <LiquityV1SystemView data={data} />
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
