// Fluid protocol view (/fluid/vaults) — every vault the factory has minted and
// each one's own risk ladder, read live from the VaultResolver at one head
// block. Server-rendered: a read-only aggregate with no interactivity to
// hydrate for, so the first paint carries the real figures rather than a
// skeleton (the same posture as the fork branch views).

import { FluidVaultsView, FluidVaultsStamp } from "@/components/protocol/fluid/fluid-vaults-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadFluidVaultsFromChain } from "@/lib/sources/chain/fluid-vaults";
import { protocolForHref } from "@/lib/shared/protocols";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fluid Vaults",
  description:
    "Every Fluid vault and its three thresholds — where borrowing stops, where liquidation starts, and where the vault absorbs a position outright.",
};

const PROTOCOL = protocolForHref("/ethereum/fluid")!;

export default async function FluidVaultsPage() {
  // Straight to the loader rather than through this deployment's own
  // /api/chain/fluid/vaults route — same code, one less hop on the server.
  const data = await loadFluidVaultsFromChain();

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Vaults & their risk ladders"
          stamp={<FluidVaultsStamp data={data} />}
        />

        <FluidVaultsView data={data} />
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
