// The cross-protocol vault index — /vaults (rails-ops ui-jobs 39).
// ----------------------------------------------------------------------------
// Decision 0028 point 8: an index may span protocols, and it owns no vault
// page. Every row is a vault a protocol roster lists, read by that roster's
// loader at that roster's block (lib/vaults/index-read.ts), and opens the
// vault's page under its protocol. It spans chains, so it sits under no chain
// and no explorer rail.

import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { VaultIndexView } from "@/components/vaults/vault-index-view";
import { loadVaultIndex } from "@/lib/vaults/index-read";
import { vaultIndexLaunched } from "@/lib/vaults/index-rosters";
import { VAULT_INDEX_HREF } from "@/lib/vaults/routes";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vaults",
  description:
    "Every vault the Morpho, Aave, Yearn and Maple rosters list on Ethereum and Base, with total assets and share price in each vault's own asset, each roster read at its own block.",
  alternates: { canonical: VAULT_INDEX_HREF },
  ...(vaultIndexLaunched() ? {} : { robots: { index: false, follow: false } }),
};

export default async function VaultIndexPage() {
  const { vaults, yields, rosters } = await loadVaultIndex();
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-6" data-skel-section="page-header">
          <h1 className="text-2xl font-semibold text-foreground">Vaults</h1>
        </header>
        <div data-roster-panel data-vault-index>
          <VaultIndexView vaults={vaults} yields={yields} rosters={rosters} />
        </div>
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
