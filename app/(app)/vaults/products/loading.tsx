// The vault products page's loading state (ui-jobs 773, 782): the /vaults head
// alone; the rows stream behind the page's Suspense.

import { VaultIndexHead } from "@/components/vaults/vault-index-head";

export default function Loading() {
  return (
    <div className="min-h-screen py-8" aria-busy="true">
      <VaultIndexHead venue="products" />
    </div>
  );
}
