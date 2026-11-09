// Fluid's vaults (/ethereum/fluid/vaults), archetype A1 on the shared product
// shell (rails-ops ui-jobs 549 step 7; decision 0059). Fluid calls each borrow
// market a vault: one head for the protocol, then every vault the factory has
// minted in one house table grouped by vault type, each row opening the vault's
// page (/ethereum/fluid/vaults/<id>). The figures are one head-block read of
// the VaultResolver; lib/fluid/product.tsx maps them into the model.
//
// Rendered per request, as before: the roster read is the one it made.

import { FluidRosterPage } from "@/lib/fluid/product";
import { loadFluidVaultsFromChain } from "@/lib/sources/chain/fluid-vaults";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fluid vaults",
  description:
    "Every Fluid vault: its collateral and debt, rates, positions and its ladder of three rungs, where borrowing stops, liquidation starts and the vault absorbs a position.",
};

export default async function FluidVaultsPage() {
  const data = await loadFluidVaultsFromChain();
  return (
    <>
      <FluidRosterPage data={data} />
      {/* Each section arms the inspector from its ⋮; no page-wide toggle. */}
      <ProvInspectorLayer />
    </>
  );
}
