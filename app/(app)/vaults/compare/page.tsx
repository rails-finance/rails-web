// The vault comparison — /vaults/compare?v=<chain id>:<address>,… (E1;
// rails-ops ui-jobs 553, door 3; Miles, 9 Nov 2026).
// ----------------------------------------------------------------------------
// Two to four vaults side by side, chosen with the ticks on the asset step and
// /vaults. Like the index (decision 0028 point 8) it spans protocols and
// chains, so it sits under no chain and no explorer rail, owns no vault page
// (each name opens the vault's page under its protocol), and carries no
// receipts and no inspector: each vault's page keeps them. The read is
// lib/vaults/compare-read.ts.

import Link from "next/link";
import { VaultCompare } from "@/components/vaults/vault-compare";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { COMPARE_HREF, COMPARE_MIN, isCompareSort, parseCompareParam } from "@/lib/vaults/compare";
import { COMPARE_PAGE, COMPARE_TITLE } from "@/lib/vaults/compare-words";
import { HEALTH_DISCLAIMER } from "@/lib/vaults/health-words";
import { readCompare } from "@/lib/vaults/compare-read";
import { vaultIndexLaunched } from "@/lib/vaults/index-rosters";
import { VAULT_INDEX_HREF } from "@/lib/vaults/routes";

export const dynamic = "force-dynamic";

/** The comparison states no receipts: its figures are plain, each vault's
 *  page carries them (check:prov reads this). */
export const PROV_EXEMPT = "the vault comparison states no receipts; each vault's page carries them (ui-jobs 553)";

export const metadata = {
  title: COMPARE_TITLE,
  description:
    "Two to four vaults side by side: size, yield, withdrawals, losses, steward, fees, where the money is lent and who holds it, each read from the chain or Rails's daily store.",
  alternates: { canonical: COMPARE_HREF },
  ...(vaultIndexLaunched() ? {} : { robots: { index: false, follow: false } }),
};

export default async function VaultComparePage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string | string[]; sort?: string | string[] }>;
}) {
  const sp = await searchParams;
  const first = (x: string | string[] | undefined) => (Array.isArray(x) ? x[0] : x);
  const keys = parseCompareParam(first(sp.v));
  const sort = first(sp.sort);
  const { columns, notFound } = await readCompare(keys);
  return (
    <div className="min-h-screen py-8" data-anatomy="E1" data-compare-page="" data-prov-exempt={PROV_EXEMPT}>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{COMPARE_TITLE}</h1>
        <p className="mt-2 max-w-2xl text-rb-500" data-compare-disclaimer="">
          {HEALTH_DISCLAIMER}
        </p>
      </header>
      {notFound.length > 0 && (
        <p className="mb-4 text-sm text-rb-500" data-compare-not-found={notFound.join(",")}>
          {COMPARE_PAGE.notFound(notFound)}
        </p>
      )}
      {columns.length < COMPARE_MIN ? (
        <p className="text-sm text-rb-500" data-compare-too-few="">
          {COMPARE_PAGE.tooFew}{" "}
          <Link href={VAULT_INDEX_HREF} className={INLINE_LINK}>
            {COMPARE_PAGE.toIndex}
          </Link>
        </p>
      ) : (
        <VaultCompare columns={columns} initialSort={isCompareSort(sort) ? sort : "size"} />
      )}
    </div>
  );
}
