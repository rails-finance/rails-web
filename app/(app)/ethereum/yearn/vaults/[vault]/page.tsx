// ONE YEARN V3 VAULT'S FACTSHEET — /ethereum/yearn/vaults/<vault>.
// ----------------------------------------------------------------------------
// A Yearn V3 vault takes one token from depositors, issues shares for it, keeps
// part of it idle for withdrawals and lends the rest to strategies. This page is
// about the VAULT: what it holds, how that splits, where the deployed part sits,
// who holds the roles over it and how a reported gain reaches the share price —
// all at one block read from chain. No indexer and no backend table.
//
// IT IS A FACTSHEET, NOT AN EXPLORER (rails-ops decision 0017, left standing by
// 0028). There is no holder lane here: who holds this vault, and what one
// address holds of it, is work that has not been done for Yearn yet, so the page
// claims nothing about it.
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
import Link from "next/link";
import { notFound } from "next/navigation";

import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { RailHeader } from "@/components/shared/rail-header";
import { YearnVaultView } from "@/components/vaults/yearn-vault-view";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { explorerUrl } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import { yearnVaultHref, yearnVaultRosterHref } from "@/lib/vaults/routes";
import { loadYearnEthereumVault } from "@/lib/sources/chain/yearn-ethereum-vault";
import { isYearnRosterVault } from "@/lib/yearn/vault-roster";
import { YEARN_CHAIN_ID } from "@/lib/sources/chain/yearn-ethereum-vault-directory";
import { YEARN_REGISTRY } from "@/lib/yearn/vault-catalog";

// Every figure is a slot read at the head — nothing about this is cacheable
// across requests.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ vault: string }> };

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

export default async function YearnVaultPage({ params }: Props) {
  const { vault } = await params;
  const address = vault.toLowerCase();
  if (!(await isYearnRosterVault(address))) notFound();

  const data = await load(address);
  const v = data.vault;

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          <div className="mb-4">
            <RailHeader session="yearn" venue="subPage" />
          </div>
          <h1 className="flex flex-wrap items-baseline gap-x-2 text-2xl font-semibold text-foreground">
            <a href={explorerUrl(YEARN_CHAIN_ID, "address", v.address)} target="_blank" rel="noopener noreferrer">
              {v.name ?? v.censusName}
            </a>
            {v.symbol && <span className="text-base font-normal text-rb-500">{v.symbol}</span>}
            {v.endorsed === true && (
              <span
                className="rounded border border-rb-200 px-1.5 py-0.5 text-[11px] font-normal text-foreground dark:border-rb-500/30"
                data-endorsed-badge
              >
                endorsed
              </span>
            )}
            {v.shutdown === true && (
              <span className="text-[11px] font-normal text-rb-500" data-shutdown-badge>
                shut down
              </span>
            )}
          </h1>

          {data.chainStale ? (
            <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-rb-500">
              This vault could not be read from chain just now, so no figure is stated for it. The page states nothing
              it could not read.
            </p>
          ) : (
            <>
              <p className="mt-2 text-[12px] text-rb-500">
                {/* The venue is on the rail above by construction (decision
                    0028), so this line names the release and the asset and
                    carries no link of its own. */}
                Yearn V3 {v.apiVersion}
                {" · "}
                <a
                  href={explorerUrl(YEARN_CHAIN_ID, "address", v.factory)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external"
                >
                  factory
                </a>
                {" · asset "}
                <a
                  href={explorerUrl(YEARN_CHAIN_ID, "address", v.asset.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={v.asset.named ? "link-external" : "link-external font-mono"}
                >
                  {v.asset.symbol}
                </a>
                {" · created in block "}
                <a
                  href={explorerUrl(YEARN_CHAIN_ID, "block", v.createdBlock)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external"
                >
                  {v.createdBlock.toLocaleString("en-US")}
                </a>
              </p>
              <p className="mt-2 text-[11px] text-rb-500" data-vault-block={data.blockNumber}>
                Read at block{" "}
                <a
                  href={explorerUrl(YEARN_CHAIN_ID, "block", data.blockNumber)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external"
                >
                  {data.blockNumber.toLocaleString("en-US")}
                </a>{" "}
                · every figure below is a slot read at that block, on the vault and on the{" "}
                <a
                  href={explorerUrl(YEARN_CHAIN_ID, "address", YEARN_REGISTRY)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external"
                >
                  Yearn V3 Registry
                </a>
                .{" "}
                {v.endorsed === true
                  ? "Yearn endorses this vault at that block, which is what the badge above says; an endorsement is an act Yearn can undo."
                  : v.endorsed === false
                    ? `This vault came out of a Yearn V3 factory and runs Yearn's vault code, which is what the release above says. Yearn's Registry answers "not endorsed" for it at that block, so it carries no badge — anyone may deploy from the factory and name the result what they like, and ${shortAddress(v.address)} is what identifies this one.`
                    : "The endorsement call did not answer at that block, so the page states nothing either way about it."}
              </p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <Link href={yearnVaultRosterHref()} className={PAGE_LINK} prefetch={false} data-link="vault-roster">
                  Every Yearn V3 vault <span aria-hidden>→</span>
                </Link>
                <Link
                  href={`${yearnVaultRosterHref()}/info`}
                  className={PAGE_LINK}
                  prefetch={false}
                  data-link="vault-info"
                >
                  How this is built <span aria-hidden>→</span>
                </Link>
              </p>
            </>
          )}
        </header>

        {!data.chainStale && <YearnVaultView data={data} />}

        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
