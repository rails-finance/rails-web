// The vault overview — /vaults (rails-ops ui-jobs 776; decision 0028 point 8).
// ----------------------------------------------------------------------------
// A card per family and chain linking its roster, then the ways into vaults
// (E6.3) and the questions (E6.4), neither under ?asset= (ui-jobs 776, 782;
// components/vaults/vault-overview.tsx, vault-faq.tsx). It spans chains,
// so it sits under no chain and no explorer rail. The counts carry their
// rosters' receipts and the page mounts the inspector.

import { Suspense } from "react";
import { VaultIndexHead } from "@/components/vaults/vault-index-head";
import { VaultOverviewCards, VaultOverviewCardsLoading, VaultWaysIn } from "@/components/vaults/vault-overview";
import { VaultFaq } from "@/components/vaults/vault-faq";
import { OVERVIEW_LEAD } from "@/lib/vaults/overview-words";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { vaultIndexLaunched } from "@/lib/vaults/index-rosters";
import { VAULT_INDEX_HREF } from "@/lib/vaults/routes";
import type { RawSearchParams } from "@/lib/shared/listing-ssr";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vaults",
  description:
    "Each vault family Rails reads, with its vault count at its roster's block and a link to its roster; then the other ways into vaults, and what a vault is and how Rails covers vaults.",
  alternates: { canonical: VAULT_INDEX_HREF },
  ...(vaultIndexLaunched() ? {} : { robots: { index: false, follow: false } }),
};

export default async function VaultOverviewPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { asset: raw } = await searchParams;
  const asset = typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
  return (
    <div className="min-h-screen">
      <div className="py-8" data-anatomy="E6" data-vault-overview="">
        <header className="mb-6" data-skel-section="page-header">
          <VaultIndexHead venue="overview" />
        </header>
        {/* The cards' lead-in; under ?asset= the asset's line stands in its place. */}
        {!asset && (
          <p className="max-w-3xl text-sm text-rb-500" data-overview-lead-in="">
            {OVERVIEW_LEAD}
          </p>
        )}
        <Suspense fallback={<VaultOverviewCardsLoading />}>
          <VaultOverviewCards asset={asset} />
        </Suspense>
        {/* The ways in and the questions stand on the landing page; under
            ?asset= the page is the asset step's family list. */}
        {!asset && (
          <>
            <VaultWaysIn />
            <VaultFaq />
          </>
        )}
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
