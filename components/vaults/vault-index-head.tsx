"use client";

// The /vaults head (rails-ops ui-jobs 776, 782): the "Vaults" h1 and, after
// it, the sections menu an explorer's rail draws (H5, SectionsMenu):
// Overview, Products, Fronts, Compare. The pages sit under no chain and no
// explorer, so the heading takes the place of the rail's identity and chain
// glyph. A sub-page draws no second heading: the menu names it.

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
  const current = sections.find((x) => x.current);
  return (
    <div className="flex items-center gap-3" data-anatomy="H3" data-vault-index-head={venue}>
      {/* The page's one h1 on every /vaults page; a sub-page's name is the menu's
          current entry, so the heading names it for a screen reader alone. */}
      <h1 className="text-2xl font-semibold text-foreground">
        Vaults
        {venue !== "overview" && current && <span className="sr-only">{` — ${current.name}`}</span>}
      </h1>
      <SectionsMenu sections={sections} label="Vaults sections" />
    </div>
  );
}
