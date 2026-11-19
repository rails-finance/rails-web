"use client";

// The /vaults head (rails-ops ui-jobs 776): the "Vaults" heading and, after
// it, the sections menu an explorer's rail draws (H5, SectionsMenu): the
// listing, About and Fronts. The index sits under no chain and no explorer,
// so the heading takes the place of the rail's identity and chain glyph.

import { SectionsMenu } from "@/components/shared/rail-header";
import { VAULT_INDEX_ABOUT_HREF, VAULT_INDEX_HREF } from "@/lib/vaults/routes";

export type VaultIndexVenue = "listing" | "about";

export function VaultIndexHead({ venue }: { venue: VaultIndexVenue }) {
  const sections = [
    { href: VAULT_INDEX_HREF, name: "Listing", current: venue === "listing" },
    { href: VAULT_INDEX_ABOUT_HREF, name: "About", current: venue === "about" },
  ];
  return (
    <div className="flex items-center gap-3" data-anatomy="H3" data-vault-index-head={venue}>
      <h1 className="text-2xl font-semibold text-foreground">Vaults</h1>
      <SectionsMenu sections={sections} label="Vaults sections" />
    </div>
  );
}
