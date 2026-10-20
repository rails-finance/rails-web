// ONE YEARN V3 VAULT'S PAGE — /ethereum/yearn/vaults/<vault>.
// ----------------------------------------------------------------------------
// The vault card (V2), where the assets are (V3) and the holder finder (V4),
// rails-ops ui-jobs 407, drawn by components/vaults/yearn-vault-page.tsx from
// one block's read of the vault. A fund factsheet (decision 0017, which 0028
// left standing). `?holder=` is the finder's submit and is sent on to the
// holder's own page one segment down.
//
// WHICH VAULTS THIS SERVES. Every vault the catalogue holds — 247 at the census
// block — and every other address 404s. The catalogue is a floor, so a 404 here
// means "not in this census" and never "not a Yearn vault".
//
// WHERE IT LIVES. Under the Vaults tab of the Yearn V3 explorer (decision 0028
// point 1): a Yearn V3 factory deployed this contract, so Yearn is the door, and
// the rail above the H1 says so. The line under the H1 names the release and the
// asset, and carries no link to the protocol.

import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { RailHeader } from "@/components/shared/rail-header";
import { YearnVaultPage } from "@/components/vaults/yearn-vault-page";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { yearnVaultHref } from "@/lib/vaults/routes";
import { loadYearnEthereumVault } from "@/lib/sources/chain/yearn-ethereum-vault";
import { isYearnRosterVault } from "@/lib/yearn/vault-roster";
import { YEARN_CHAIN_ID } from "@/lib/sources/chain/yearn-ethereum-vault-directory";
import { loadVaultPageSeries } from "@/lib/vaults/yield-read";

// Every figure is a slot read at the head — nothing about this is cacheable
// across requests.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ vault: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const firstParam = (v: string | string[] | undefined): string | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/** One read per request: `generateMetadata` and the page both await this, and
 *  React's cache() collapses the two into one chain read. */
const load = cache((vault: string) => loadYearnEthereumVault(vault));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vault } = await params;
  const address = vault.toLowerCase();
  if (!(await isYearnRosterVault(address))) return { title: "Yearn V3 vault" };
  const data = await load(address);
  const name = data.vault.name ?? data.vault.censusName;
  return listingMetadata({
    title: `${name} · Yearn V3`,
    description: `What the ${name} vault holds, how it splits between idle and deployed, the strategies its withdrawal queue walks and who holds the roles over it — read from the contract at one block.`,
    canonicalPath: yearnVaultHref(address),
  });
}

export default async function YearnVaultRoute({ params, searchParams }: Props) {
  const { vault } = await params;
  const address = vault.toLowerCase();
  if (!(await isYearnRosterVault(address))) notFound();

  // The finder's submit (V4), sent on to the holder's own path as typed; the
  // holder route resolves a name and states every outcome. `redirect()`
  // throws, so it sits before every read.
  const typed = firstParam((await searchParams).holder)?.trim();
  if (typed) redirect(yearnVaultHref(address, typed));

  const [data, series] = await Promise.all([load(address), loadVaultPageSeries(YEARN_CHAIN_ID, address)]);

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          <RailHeader session="yearn" venue="subPage" />
        </header>

        {data.chainStale ? (
          <p className="max-w-3xl text-[13px] leading-relaxed text-rb-500">
            This vault could not be read from chain just now, so no figure is stated for it.
          </p>
        ) : (
          <YearnVaultPage data={data} yieldFigure={series.yieldFigure} strip={series.strip} />
        )}

        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
