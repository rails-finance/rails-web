// The IPOR Fusion pages, one body per chain (rails-ops TO-DO-ipor-scoping
// §6.3): the roster, the about page, a vault's factsheet and its 404. Each
// chain's route files under app/(app)/<chain>/ipor-fusion are a line each
// that call these with their chain id. Server components.

import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { serverReadOf } from "@/lib/shared/server-head-read";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { RailHeader } from "@/components/shared/rail-header";
import { RouteNotFound } from "@/components/shared/route-not-found";
import { FocusSourceGate } from "@/components/shared/aim-gate";
import { Prov } from "@/components/shared/provenance";
import { VaultsInfoPage } from "@/components/vaults/vaults-info-page";
import { IporFusionVaultDirectoryView, IPOR_FUSION_DOCS } from "@/components/vaults/ipor-fusion-vault-directory-view";
import { IporFusionVaultPage } from "@/components/vaults/ipor-fusion-vault-page";
import { loadIporFusionVaultDirectory } from "@/lib/sources/chain/ipor-fusion-vault-directory";
import { IPOR_ROLE_LOG_LANE, loadIporFusionVault } from "@/lib/sources/chain/ipor-fusion-vault";
import { iporFusionRoster, iporFusionRosterEntry, type IporFusionChainId } from "@/lib/ipor-fusion/vault-roster";
import { iporRosterCensusProv } from "@/lib/ipor-fusion/vault-provenance";
import { iporFusionVaultSummaries } from "@/lib/vaults/summary";
import {
  iporFusionVaultHref,
  iporFusionVaultRosterHref,
  metaMorphoVaultHref,
  yearnVaultHref,
} from "@/lib/vaults/routes";
import { isYearnRosterVault } from "@/lib/yearn/vault-roster";
import { metaMorphoRosterEntry } from "@/lib/metamorpho/vault-roster";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { PROTOCOLS } from "@/lib/shared/protocols";
import { chainMeta, type ChainId } from "@/lib/shared/chains";
import { FOOT_LINK } from "@/lib/shared/ui-grammar";
import { toURLSearchParams, type RawSearchParams } from "@/lib/shared/listing-ssr";
import type { SessionProtocol } from "@/lib/shared/sessions";

const n = (v: number) => v.toLocaleString("en-US");

/** The roster entry for IPOR Fusion on a chain. */
function entryOf(chainId: IporFusionChainId) {
  const e = PROTOCOLS.find((p) => p.slug === "ipor-fusion" && p.chainId === chainId);
  if (!e) throw new Error(`no IPOR Fusion roster entry on chain ${chainId}`);
  return e;
}
const sessionOf = (chainId: IporFusionChainId) => entryOf(chainId).session as SessionProtocol;
const chainName = (chainId: IporFusionChainId) => chainMeta(chainId as ChainId).name;

// ── the explorer root and its (i) ────────────────────────────────────────────

/** The explorer root: a permanent redirect to its one sub-page, the roster. */
export function iporFusionRootRedirect(chainId: IporFusionChainId): never {
  redirect(entryOf(chainId).subPages[0]!.href);
}

/** The rail's (i): the roster's about page a segment along. */
export function iporFusionInfoRedirect(chainId: IporFusionChainId): never {
  redirect(`${entryOf(chainId).subPages[0]!.href}/info`);
}

// ── the roster ──────────────────────────────────────────────────────────────

export function iporFusionRosterMetadata(chainId: IporFusionChainId): Metadata {
  const roster = iporFusionRoster(chainId);
  return listingMetadata({
    title: chainId === 1 ? "IPOR Fusion vaults" : `IPOR Fusion vaults on ${chainName(chainId)}`,
    canonicalPath: iporFusionVaultRosterHref(chainId)!,
    description: `Every vault the IPOR Fusion factory had made on ${chainName(chainId)} at the census block, ${n(roster.vaults.length)} of them, with each one's name, asset, total assets and share price read from chain at one block.`,
  });
}

export async function IporFusionRosterPage({
  chainId,
  searchParams,
}: {
  chainId: IporFusionChainId;
  searchParams: Promise<RawSearchParams>;
}) {
  const initialSearch = toURLSearchParams(await searchParams).toString();
  const data = await loadIporFusionVaultDirectory(chainId);
  return (
    <div className="min-h-screen">
      <div className="py-8">
        {/* The rail alone: no "Vaults" heading (Miles, 19 Nov 2026); the h1 is for screen readers. */}
        <header className="mb-5" data-skel-section="page-header">
          <RailHeader session={sessionOf(chainId)} venue="subPage" />
          <h1 className="sr-only">IPOR Fusion vaults{chainId === 1 ? "" : ` on ${chainName(chainId)}`}</h1>
        </header>
        <div data-roster-panel>
          <IporFusionVaultDirectoryView
            chainId={chainId as ChainId}
            initialSearch={initialSearch}
            vaults={iporFusionVaultSummaries(data)}
            blockNumber={data.blockNumber}
            readBy={serverReadOf(data)}
            chainStale={data.chainStale}
            catalogSize={data.catalogSize}
          />
        </div>
        <ProvInspectorLayer />
      </div>
    </div>
  );
}

// ── the about page ──────────────────────────────────────────────────────────

export function iporFusionInfoMetadata(chainId: IporFusionChainId): Metadata {
  return listingMetadata({
    title:
      chainId === 1
        ? "About the IPOR Fusion vault roster"
        : `About the IPOR Fusion vault roster on ${chainName(chainId)}`,
    canonicalPath: `${iporFusionVaultRosterHref(chainId)}/info`,
    description:
      "How Rails builds the IPOR Fusion roster: every vault the factory made, the creation event that enumerates them, the roles over each vault, and why totals stay in each vault's asset.",
  });
}

/** The one place the words about the roster live (Miles, 19 Nov 2026). No
 *  chain read; the count comes from the census, with its receipt. */
export function IporFusionInfoPage({ chainId }: { chainId: IporFusionChainId }) {
  const roster = iporFusionRoster(chainId);
  const chain = chainName(chainId);
  const rolesRead = IPOR_ROLE_LOG_LANE[chainId] != null;
  return (
    <VaultsInfoPage chainId={chainId as ChainId} protocol={entryOf(chainId)}>
      <p data-intro-membership>
        An IPOR Fusion vault takes deposits of one token and issues shares for them. Its curator moves the token into
        other protocols through fuses, small contracts that each act in one protocol. A share converts to more of the
        token as those positions earn; the Share price column is the vault&rsquo;s answer to{" "}
        <code>convertToAssets</code>, in its asset.
      </p>
      <p data-intro-roster>
        The roster is every vault the IPOR Fusion factory made on {chain}:{" "}
        <Prov
          info={iporRosterCensusProv(
            { chainId },
            { catalogSize: roster.vaults.length, censusBlock: roster.censusBlock, factory: roster.factory },
          )}
        >
          {n(roster.vaults.length)} by block {n(roster.censusBlock)}
        </Prov>
        , each found from the creation event the factory emits. Anyone may deploy from the factory, so a vault on the
        list is not one IPOR curates. The list is a floor: a vault deployed by hand or by an earlier factory emits no
        such event, and a vault made since that block joins when the census runs again. Every figure is read from chain
        at one block, at most five minutes old.
      </p>
      <p data-intro-roles>
        Each vault has an access manager that grants roles. Rails calls the holder of OWNER_ROLE the vault&rsquo;s
        owner, who appoints its Atomist, owners and guardians, and the holder of ALPHA_ROLE its curator, IPOR&rsquo;s
        Alpha, who moves the assets between markets. The Atomist, who manages the vault&rsquo;s settings and fuses,
        keeps IPOR&rsquo;s word, and every other role is named by its constant in IPOR&rsquo;s code. The access manager
        keeps no list of a role&rsquo;s holders, so a vault&rsquo;s page finds them in its grant events and confirms
        each one at the block it reads.
        {!rolesRead &&
          ` On ${chain} Rails has no logs lane that reaches a vault's history yet, so a vault's page states its roles as not read.`}
      </p>
      <p data-intro-fees>
        A vault charges a performance fee on gains in the share price and a yearly management fee on its assets, each
        minted to its fee account as new shares. The IPOR DAO keeps a register of fuses, marking each one active,
        deprecated or removed; a vault&rsquo;s page states each of its fuses&rsquo; standing there.
      </p>
      <p data-intro-units>
        Amounts are in each vault&rsquo;s asset and nothing is priced in dollars, so two assets are never ordered or
        added together. A vault&rsquo;s total assets include the balances it last recorded in each market, which can
        trail the markets. An empty vault answered zero to <code>totalAssets()</code>: one never funded looks the same
        as one whose depositors have all left. A vault&rsquo;s position in a protocol Rails covers is that
        explorer&rsquo;s row, under the vault&rsquo;s address.
      </p>
      <p data-intro-docs>
        <a href={IPOR_FUSION_DOCS.href} target="_blank" rel="noopener" className={`font-medium ${FOOT_LINK}`}>
          IPOR&rsquo;s documentation
        </a>{" "}
        explains fuses and markets in IPOR&rsquo;s terms.
      </p>
      <ProvInspectorLayer />
    </VaultsInfoPage>
  );
}

// ── a vault's factsheet ─────────────────────────────────────────────────────

/** One read per request per (chain, vault): metadata and the page share it. */
const load = cache((chainId: IporFusionChainId, vault: string) => loadIporFusionVault(chainId, vault));

export async function iporFusionVaultMetadata(
  chainId: IporFusionChainId,
  params: Promise<{ vault: string }>,
): Promise<Metadata> {
  const address = (await params).vault.toLowerCase();
  if (!iporFusionRosterEntry(chainId, address)) return { title: "IPOR Fusion vault" };
  const data = await load(chainId, address);
  const name = data.vault.name ?? data.vault.censusName ?? address;
  return listingMetadata({
    title: `${name} · IPOR Fusion`,
    description: `What the ${name} vault holds, its fees and supply cap, who holds the roles over it and the fuses it acts through, read from the contracts at one block.`,
    canonicalPath: iporFusionVaultHref(chainId, address)!,
  });
}

/** The child vaults with a Rails page: a Yearn V3 vault (Ethereum), a
 *  MetaMorpho vault (Ethereum, Base), or another IPOR Fusion vault on the
 *  chain; and a cross-chain market's remote IPOR Fusion vaults. */
async function childPagesOf(
  chainId: IporFusionChainId,
  data: Awaited<ReturnType<typeof loadIporFusionVault>>,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const children = new Set(
    (data.markets?.rows ?? [])
      .filter((r) => r.kind === "child")
      .flatMap((r) => (r.substrates ?? []).flatMap((s) => (s.kind === "address" ? [s.address] : []))),
  );
  // A cross-chain market's remote vaults in the census on their chain, keyed
  // by chain and address.
  for (const r of data.markets?.rows ?? [])
    if (r.kind === "crosschain")
      for (const g of r.substrates ?? [])
        if (g.kind === "remote-vault" && (g.chainId === 1 || g.chainId === 42161 || g.chainId === 8453)) {
          const href = iporFusionRosterEntry(g.chainId, g.address) ? iporFusionVaultHref(g.chainId, g.address) : null;
          if (href) out[`${g.chainId}:${g.address}`] = href;
        }
  await Promise.all(
    [...children].map(async (a) => {
      if (chainId === 1 && (await isYearnRosterVault(a))) out[a] = yearnVaultHref(a);
      else if ((chainId === 1 || chainId === 8453) && (await metaMorphoRosterEntry(chainId, a)))
        out[a] = metaMorphoVaultHref(chainId, a);
      else if (iporFusionRosterEntry(chainId, a)) out[a] = iporFusionVaultHref(chainId, a)!;
    }),
  );
  return out;
}

export async function IporFusionVaultRoute({
  chainId,
  params,
}: {
  chainId: IporFusionChainId;
  params: Promise<{ vault: string }>;
}) {
  const address = (await params).vault.toLowerCase();
  if (!iporFusionRosterEntry(chainId, address)) notFound();
  const data = await load(chainId, address);
  const childPages = await childPagesOf(chainId, data);
  return (
    <FocusSourceGate source={data.vault} chain={chainId} what="This vault">
      <div className="min-h-screen">
        <div className="py-8">
          <header className="mb-5" data-skel-section="page-header">
            <RailHeader session={sessionOf(chainId)} venue="subPage" />
          </header>
          {data.chainStale ? (
            <p className="max-w-3xl text-[13px] leading-relaxed text-rb-500">
              This vault could not be read from chain just now, so no figure is stated for it.
            </p>
          ) : (
            <IporFusionVaultPage data={data} childPages={childPages} />
          )}
          <ProvInspectorLayer />
        </div>
      </div>
    </FocusSourceGate>
  );
}

/** The 404 body for an address the census does not hold on the chain. */
export function IporFusionVaultNotFound({ chainId }: { chainId: IporFusionChainId }) {
  const roster = iporFusionRoster(chainId);
  return (
    <RouteNotFound
      session={sessionOf(chainId)}
      heading="No vault page for this address"
      backHref={iporFusionVaultRosterHref(chainId)!}
      backLabel="Every IPOR Fusion vault"
    >
      This explorer serves the vaults the IPOR Fusion factory made on {chainName(chainId)}, as they stood at block{" "}
      {n(roster.censusBlock)}, each one announced by a creation event the census sweeps. That roster is a floor: a vault
      deployed by hand or by an earlier factory leaves nothing to sweep, and a vault made since that block joins when
      the census runs again. So an address the census has not seen may well be an IPOR Fusion vault, and it has no page
      here.
    </RouteNotFound>
  );
}
