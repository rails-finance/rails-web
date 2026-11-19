"use client";

// The /vaults head (rails-ops ui-jobs 776): the "Vaults" heading and, after
// it, the sections menu an explorer's rail draws (H5, SectionsMenu): All
// vaults, Fronts, then About last, as a rail orders its info page. The index
// sits under no chain and no explorer, so the heading takes the place of the
// rail's identity and chain glyph.

import { SectionsMenu } from "@/components/shared/rail-header";
import { FRONTS_HREF, VAULT_INDEX_ABOUT_HREF, VAULT_INDEX_HREF } from "@/lib/vaults/routes";

export type VaultIndexVenue = "listing" | "about" | "fronts";

export function VaultIndexHead({ venue }: { venue: VaultIndexVenue }) {
  const sections = [
    { href: VAULT_INDEX_HREF, name: "All vaults", current: venue === "listing" },
    { href: FRONTS_HREF, name: "Fronts", current: venue === "fronts" },
    { href: VAULT_INDEX_ABOUT_HREF, name: "About", current: venue === "about" },
  ];
  return (
    <div className="flex items-center gap-3" data-anatomy="H3" data-vault-index-head={venue}>
      {/* Fronts' page heading is its h1 ("Vault fronts"), so there "Vaults" is a label. */}
      {venue === "fronts" ? (
        <p className="text-2xl font-semibold text-foreground">Vaults</p>
      ) : (
        <h1 className="text-2xl font-semibold text-foreground">Vaults</h1>
      )}
      <SectionsMenu sections={sections} label="Vaults sections" />
    </div>
  );
}
