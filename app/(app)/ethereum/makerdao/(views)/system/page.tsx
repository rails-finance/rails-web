// /makerdao/system — MakerDAO's protocol view: the Vat's balance sheet,
// decomposed by ilk. The static `system` segment sits beside `[vaultId]`; Next
// resolves static before dynamic, so a vault can never shadow it.

import { MakerSystemView, MakerSystemStamp } from "@/components/protocol/makerdao/makerdao-system-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadMakerSystemFromChain } from "@/lib/sources/chain/makerdao-system";
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
  title: "MakerDAO System",
  description:
    "The Vat's balance sheet decomposed by collateral type: every DAI in existence, what mints it, and the terms governance set for each.",
};

const PROTOCOL = protocolForHref("/ethereum/makerdao")!;

export default async function MakerSystemPage() {
  // Read straight from the loader rather than through this deployment's own
  // /api/chain/makerdao/system route — same code, one less hop on the server.
  const data = await loadMakerSystemFromChain();

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader protocol={PROTOCOL} title="The Vat" stamp={<MakerSystemStamp data={data} />} />

        <MakerSystemView data={data} />
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
