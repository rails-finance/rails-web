"use client";

// The /vaults head (rails-ops ui-jobs 776): the "Vaults" heading and, after
// it, the sections menu an explorer's rail draws (H5, SectionsMenu):
// Overview, Products, Fronts, Compare. The pages sit under no chain and no explorer,
// so the heading takes the place of the rail's identity and chain glyph.

import { SectionsMenu } from "@/components/shared/rail-header";
import { COMPARE_HREF } from "@/lib/vaults/compare";
import { FRONTS_HREF, PRODUCTS_HREF, VAULT_INDEX_HREF } from "@/lib/vaults/routes";

export type VaultIndexVenue = "overview" | "products" | "fronts" | "compare";

export function VaultIndexHead({ venue }: { venue: VaultIndexVenue }) {
  const sections = [
    { href: VAULT_INDEX_HREF, name: "Overview", current: venue === "overview" },
    { href: PRODUCTS_HREF, name: "Products", current: venue === "products" },
    { href: FRONTS_HREF, name: "Fronts", current: venue === "fronts" },
    { href: COMPARE_HREF, name: "Compare", current: venue === "compare" },
  ];
  return (
    <div className="flex items-center gap-3" data-anatomy="H3" data-vault-index-head={venue}>
      {/* Products, Fronts and Compare head their pages with their own h1, so there "Vaults" is a label. */}
      {venue === "overview" ? (
        <h1 className="text-2xl font-semibold text-foreground">Vaults</h1>
      ) : (
        <p className="text-2xl font-semibold text-foreground">Vaults</p>
      )}
      <SectionsMenu sections={sections} label="Vaults sections" />
    </div>
  );
}
