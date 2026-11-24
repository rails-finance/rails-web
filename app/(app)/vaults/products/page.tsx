// The vault products — /vaults/products (E7; rails-ops ui-jobs 773).
// ----------------------------------------------------------------------------
// One row per vault family the index lists: how a deposit is redeemed, the
// steward roles, the timelock, the fees, the count of vaults at the roster's
// block and where a vault's withdrawable figure is stated
// (components/vaults/vault-products.tsx). Like the overview it spans chains,
// so it sits under no chain and no explorer rail. The counts carry their
// rosters' receipts and the page mounts the inspector.

// focus: one row per vault family, the same for every reader; each vault's page applies the focus.

import { Suspense } from "react";
import { VaultIndexHead } from "@/components/vaults/vault-index-head";
import { VaultProducts } from "@/components/vaults/vault-products";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { vaultIndexLaunched } from "@/lib/vaults/index-rosters";
import { PRODUCTS_HREF } from "@/lib/vaults/routes";
import { PRODUCTS_PAGE, PRODUCTS_TITLE } from "@/lib/vaults/products-words";

export const dynamic = "force-dynamic";

export const metadata = {
  title: PRODUCTS_TITLE,
  description:
    "Each vault family Rails reads: how a deposit is redeemed, the steward roles, the timelock, the fees, and its vault count at its roster's block.",
  alternates: { canonical: PRODUCTS_HREF },
  ...(vaultIndexLaunched() ? {} : { robots: { index: false, follow: false } }),
};

export default function VaultProductsPage() {
  return (
    <div className="min-h-screen py-8" data-anatomy="E7" data-products-page="">
      <header className="mb-6" data-skel-section="page-header">
        <VaultIndexHead venue="products" />
        <p className="mt-4 max-w-2xl text-rb-500">{PRODUCTS_PAGE.lead}</p>
      </header>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-raised" data-vault-products="pending" />}>
        <VaultProducts />
      </Suspense>
      <ProvInspectorLayer />
    </div>
  );
}
