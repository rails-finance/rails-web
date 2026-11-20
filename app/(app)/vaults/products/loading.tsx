// The vault products page's loading state (ui-jobs 773): the /vaults head and
// the heading; the rows stream behind the page's Suspense.

import { VaultIndexHead } from "@/components/vaults/vault-index-head";
import { PRODUCTS_TITLE } from "@/lib/vaults/products-words";

export default function Loading() {
  return (
    <div className="min-h-screen py-8" aria-busy="true">
      <VaultIndexHead venue="products" />
      <h1 className="mt-4 text-lg font-semibold text-foreground">{PRODUCTS_TITLE}</h1>
    </div>
  );
}
