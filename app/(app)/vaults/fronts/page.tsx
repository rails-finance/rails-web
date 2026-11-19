// The vault fronts — /vaults/fronts (E5; rails-ops ui-jobs 774).
// ----------------------------------------------------------------------------
// The apps that put an on-chain vault behind their own product, each row cited
// to the front's published page (decision 0017 point 5; the admission rule is
// in lib/vaults/fronts.ts). Like the index it spans chains, so it sits under no
// chain and no explorer rail. A row whose vault Rails reads links to the
// vault's page (lib/vaults/fronts-read.ts).

// focus: a list of apps cited to their own pages; each vault's page applies the focus.

import { VaultFronts } from "@/components/vaults/vault-fronts";
import { FRONTS_HREF } from "@/lib/vaults/fronts";
import { readFronts } from "@/lib/vaults/fronts-read";
import { FRONTS_PAGE, FRONTS_TITLE } from "@/lib/vaults/fronts-words";
import { vaultIndexLaunched } from "@/lib/vaults/index-rosters";

export const dynamic = "force-dynamic";

/** The rows cite the fronts' pages, read on a named day; no figure is read
 *  from the chain (check:prov reads this). */
const PROV_EXEMPT = "the rows cite the fronts' published pages, not chain reads (ui-jobs 774)";

export const metadata = {
  title: FRONTS_TITLE,
  description:
    "Exchanges, wallets and fintechs that put an on-chain vault behind their own product, each cited to the page the app publishes.",
  alternates: { canonical: FRONTS_HREF },
  ...(vaultIndexLaunched() ? {} : { robots: { index: false, follow: false } }),
};

export default async function VaultFrontsPage() {
  const rows = await readFronts();
  return (
    <div className="min-h-screen py-8" data-anatomy="E5" data-fronts-page="" data-prov-exempt={PROV_EXEMPT}>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{FRONTS_TITLE}</h1>
        <p className="mt-2 max-w-2xl text-rb-500">{FRONTS_PAGE.lead}</p>
      </header>
      <VaultFronts rows={rows} />
    </div>
  );
}
