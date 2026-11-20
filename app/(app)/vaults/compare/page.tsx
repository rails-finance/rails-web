// The vault comparison — /vaults/compare?v=<chain id>:<address>,… (E1;
// rails-ops ui-jobs 553 door 3, 779; Miles, 20 Nov 2026).
// ----------------------------------------------------------------------------
// The picker (E1.1) first: two to four vaults found by search, in the order
// picked, written to `?v=` so a comparison can be shared. Then, for two or
// more, Differences (E1.2) and the full record (components/vaults/
// vault-compare.tsx). It spans protocols and chains (decision 0028 point 8),
// so it sits under no chain and no explorer rail, under the /vaults head
// (ui-jobs 776), and owns no vault page: each name opens the vault's page
// under its protocol. Every figure carries its receipt, and the page mounts
// the inspector. The read is lib/vaults/compare-read.ts.

import { VaultCompare } from "@/components/vaults/vault-compare";
import { ComparePicker } from "@/components/vaults/compare-picker";
import { VaultIndexHead } from "@/components/vaults/vault-index-head";
import { ProvSection } from "@/components/shared/section-menu";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { COMPARE_HREF, COMPARE_MIN, parseCompareParam } from "@/lib/vaults/compare";
import { COMPARE_PAGE, COMPARE_TITLE } from "@/lib/vaults/compare-words";
import { readCompare } from "@/lib/vaults/compare-read";
import { vaultIndexLaunched } from "@/lib/vaults/index-rosters";

export const dynamic = "force-dynamic";

export const metadata = {
  title: COMPARE_TITLE,
  description:
    "Two to four vaults side by side, found by search: where they differ, then size, yield, withdrawals, losses, steward, fees, where the money is lent and who holds it, each with its receipt.",
  alternates: { canonical: COMPARE_HREF },
  ...(vaultIndexLaunched() ? {} : { robots: { index: false, follow: false } }),
};

export default async function VaultComparePage({ searchParams }: { searchParams: Promise<{ v?: string | string[] }> }) {
  const sp = await searchParams;
  const first = (x: string | string[] | undefined) => (Array.isArray(x) ? x[0] : x);
  const keys = parseCompareParam(first(sp.v));
  const { columns, notFound } = await readCompare(keys);
  return (
    <div className="min-h-screen py-8" data-anatomy="E1" data-compare-page="">
      <header className="mb-6">
        <VaultIndexHead venue="compare" />
        <h1 className="mt-4 text-lg font-semibold text-foreground">{COMPARE_TITLE}</h1>
        <p className="mt-2 max-w-2xl text-rb-500" data-compare-disclaimer="">
          {COMPARE_PAGE.lead}
        </p>
      </header>
      {notFound.length > 0 && (
        <p className="mb-4 text-sm break-all text-rb-500" data-compare-not-found={notFound.join(",")}>
          {COMPARE_PAGE.notFound(notFound)}
        </p>
      )}
      <div className="mb-8">
        {/* Keyed by the picks, so a new comparison starts the picker from them. */}
        <ComparePicker
          key={columns.map((c) => c.key).join(",")}
          initial={columns.map((c) => ({ key: c.key, name: c.name, detail: `${c.family} · ${c.chain}` }))}
        />
      </div>
      {columns.length >= COMPARE_MIN && (
        <ProvSection scope="vault-compare" as="div">
          <VaultCompare columns={columns} />
        </ProvSection>
      )}
      <ProvInspectorLayer />
    </div>
  );
}
