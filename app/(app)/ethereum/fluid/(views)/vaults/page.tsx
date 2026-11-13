// Fluid's vaults (/ethereum/fluid/vaults), archetype A1 on the shared product
// shell (rails-ops ui-jobs 549 step 7; decision 0059). Fluid calls each borrow
// market a vault: one head for the protocol, then every vault the factory has
// minted in one house table grouped by vault type, each row opening the vault's
// page (/ethereum/fluid/vaults/<id>). The figures are one head-block read of
// the VaultResolver; lib/fluid/product.tsx maps them into the model. The head's
// open count is one read of Rails's index (lib/fluid/open-count.ts), made
// beside the chain read.
//
// Rendered per request, as before: the roster read is the one it made.

import { FluidRosterPage } from "@/lib/fluid/product";
import { loadFluidVaultsFromChain } from "@/lib/sources/chain/fluid-vaults";
import { loadFluidOpenCount } from "@/lib/fluid/open-count";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fluid vaults",
  description:
    "Every Fluid vault: its collateral and debt, rates, positions and its ladder of three rungs: the collateral factor, the liquidation threshold and the liquidation max limit.",
};

export default async function FluidVaultsPage() {
  const [data, open] = await Promise.all([loadFluidVaultsFromChain(), loadFluidOpenCount()]);
  return (
    <>
      <FluidRosterPage data={data} open={open} />
      {/* Each section arms the inspector from its ⋮; no page-wide toggle. */}
      <ProvInspectorLayer />
    </>
  );
}
