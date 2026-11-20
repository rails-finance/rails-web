// The overview's skeleton: the page streams its cards behind Suspense
// (components/vaults/vault-overview.tsx), so this shows only while the route
// compiles or the head renders.

import { VaultIndexHead } from "@/components/vaults/vault-index-head";
import { VaultOverviewCardsLoading } from "@/components/vaults/vault-overview";

export default function Loading() {
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-6" data-skel-section="page-header">
          <VaultIndexHead venue="overview" />
        </header>
        <VaultOverviewCardsLoading />
      </div>
    </div>
  );
}
