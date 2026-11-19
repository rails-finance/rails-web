// The vault index's About page — /vaults/about (rails-ops ui-jobs 776): the
// /vaults sections menu's second entry, a link to each family's vaults info
// page. It reads no chain state, so it states no receipts and mounts no
// inspector.

import { VaultIndexHead } from "@/components/vaults/vault-index-head";
import { VaultIndexAbout } from "@/components/vaults/vault-index-about";
import { vaultIndexLaunched } from "@/lib/vaults/index-rosters";
import { VAULT_INDEX_ABOUT_HREF } from "@/lib/vaults/routes";

/** The page states no figures, so no receipts (check:prov reads this). */
const PROV_EXEMPT = "the vault index's About page links each family's info page and states no figures (ui-jobs 776)";

export const metadata = {
  title: "About the vault index",
  description: "Each vault family the Rails vault index reads, linked to the page on how Rails reads it.",
  alternates: { canonical: VAULT_INDEX_ABOUT_HREF },
  ...(vaultIndexLaunched() ? {} : { robots: { index: false, follow: false } }),
};

export default function VaultIndexAboutPage() {
  return (
    <div className="min-h-screen py-8" data-anatomy="E6" data-index-about-page="" data-prov-exempt={PROV_EXEMPT}>
      <header className="mb-6" data-skel-section="page-header">
        <VaultIndexHead venue="about" />
      </header>
      <VaultIndexAbout />
    </div>
  );
}
