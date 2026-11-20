// The vault overview — /vaults (rails-ops ui-jobs 776; decision 0028 point 8).
// ----------------------------------------------------------------------------
// What a vault is, how Rails shows one, then a card per family and chain
// linking its roster (components/vaults/vault-overview.tsx). It spans chains,
// so it sits under no chain and no explorer rail. The counts carry their
// rosters' receipts and the page mounts the inspector.

import { Suspense } from "react";
import { VaultIndexHead } from "@/components/vaults/vault-index-head";
import { VaultOverviewCards, VaultOverviewCardsLoading, VaultOverviewIntro } from "@/components/vaults/vault-overview";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { vaultIndexLaunched } from "@/lib/vaults/index-rosters";
import { VAULT_INDEX_HREF } from "@/lib/vaults/routes";
import type { RawSearchParams } from "@/lib/shared/listing-ssr";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vaults",
  description:
    "What a vault is and how Rails shows one, then each vault family Rails reads: its vault count at its roster's block, and a link to its roster.",
  alternates: { canonical: VAULT_INDEX_HREF },
  ...(vaultIndexLaunched() ? {} : { robots: { index: false, follow: false } }),
};

export default async function VaultOverviewPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { asset } = await searchParams;
  return (
    <div className="min-h-screen">
      <div className="py-8" data-anatomy="E6" data-vault-overview="">
        <header className="mb-6" data-skel-section="page-header">
          <VaultIndexHead venue="overview" />
        </header>
        <VaultOverviewIntro />
        <Suspense fallback={<VaultOverviewCardsLoading />}>
          <VaultOverviewCards asset={typeof asset === "string" && asset.trim() ? asset.trim() : undefined} />
        </Suspense>
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
