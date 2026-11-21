// The Liquity V2 forks' Stability Pool routes (rails-ops
// TO-DO-stability-pool-deposits §3.2), server halves: the listing, a deposit
// and a deposit's event, each the same for Asymmetry, Basedollar and Ebisu
// with the fork's deployment record (lib/liquity-v2/sp-deployment.ts). Each
// route file under app/(app)/<chain>/<fork>/ names its fork and states its
// segment config; these build the metadata and the body. Liquity V2's own
// routes are the sibling (app/(app)/ethereum/liquity-v2/stability-pool).
// SERVER-ONLY: the deposit read goes to the box (lib/liquity-v2/sp-page-data.ts).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { decodeEventId, eventMetadata, listingMetadata, positionMetadata } from "@/lib/shared/page-metadata";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { AimGate } from "@/components/shared/aim-gate";
import { RouteNotFound } from "@/components/shared/route-not-found";
import { assetKey } from "@/lib/shared/asset-family";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { SpDepositPage } from "@/components/protocol/liquity/sp-deposit-page";
import { ForkSpListing } from "@/components/protocol/liquity/fork-sp-listing";
import { redirectWalletSearch } from "@/lib/wallet/wallet-search-redirect";
import { fetchSpPage, spListDimensions, SP_LIST_DEFAULTS } from "@/lib/liquity-v2/sp-listing";
import { loadSpDeposit } from "@/lib/liquity-v2/sp-page-data";
import { normalizeDepositor } from "@/lib/liquity-v2/sp-routes";
import { spEventLabel } from "@/lib/liquity-v2/sp-event-prose";
import { spEventPageDescription } from "@/lib/liquity-v2/sp-explorer";
import { spDepositHref, spPool, SP_DEPLOYMENTS, type SpDeployment } from "@/lib/liquity-v2/sp-deployment";
import type { LiquityForkDeployment } from "./explorer";

export interface SpDepositParams {
  params: Promise<{ collateralType: string; wallet: string; eventId?: string }>;
}

const branchList = (dep: SpDeployment): string => {
  const s = dep.pools.map((p) => p.symbol);
  return s.length < 2 ? s.join("") : `${s.slice(0, -1).join(", ")} and ${s[s.length - 1]}`;
};

// ── the listing ──────────────────────────────────────────────────────────────

export function forkSpListingMetadata(fork: LiquityForkDeployment): Metadata {
  const dep = SP_DEPLOYMENTS[fork];
  return listingMetadata({
    title: `${dep.name} Stability Pool deposits`,
    canonicalPath: dep.spPath,
    description: `Every deposit in ${dep.name}'s ${branchList(dep)} stability pools: what each has deposited, lost to liquidations and been paid in collateral and ${dep.stable.symbol} yield.`,
  });
}

export async function ForkSpListingPage({
  fork,
  searchParams,
}: {
  fork: LiquityForkDeployment;
  searchParams: Promise<RawSearchParams>;
}) {
  const dep = SP_DEPLOYMENTS[fork];
  const dims = spListDimensions();
  const sp = toURLSearchParams(await searchParams);
  // A depositor search opens the wallet page (ui-jobs 738).
  redirectWalletSearch(sp, fork);
  const { filters, page } = ssrDecode(dims, sp, SP_LIST_DEFAULTS);
  const initial = await ssrInitial({
    dims,
    defaults: SP_LIST_DEFAULTS,
    filters,
    page,
    label: `${dep.name} deposits`,
    fetchPage: (baseUrl, signal, headers) => fetchSpPage<string>(filters, page, { baseUrl, signal, headers }, dep),
  });
  return <ForkSpListing fork={fork} {...initial} initialSearch={sp.toString()} />;
}

// ── a deposit and its events ─────────────────────────────────────────────────

const DESCRIPTION = (dep: SpDeployment) =>
  `A Rails replay of this ${dep.name} stability-pool deposit: every operation from the pool's events, with a receipt on every number.`;

function named(dep: SpDeployment, rawBranch: string, rawWallet: string) {
  const pool = spPool(dep, rawBranch);
  const depositor = normalizeDepositor(rawWallet);
  return {
    pool,
    depositor,
    meta: {
      session: dep.session as SessionProtocol,
      subject: depositor ?? rawWallet,
      market: `${pool?.symbol ?? rawBranch} Stability Pool`,
      noun: "Deposit",
    },
  };
}

export async function forkSpDepositMetadata(
  fork: LiquityForkDeployment,
  { params }: SpDepositParams,
): Promise<Metadata> {
  const dep = SP_DEPLOYMENTS[fork];
  const { collateralType: rawBranch, wallet: rawWallet, eventId } = await params;
  const { pool, depositor, meta } = named(dep, rawBranch, rawWallet);
  const canonical =
    pool && depositor ? spDepositHref(dep, pool.symbol, depositor) : `${dep.spPath}/${rawBranch}/${rawWallet}`;
  if (eventId == null || !pool || !depositor)
    return positionMetadata({ ...meta, canonicalPath: canonical, description: () => DESCRIPTION(dep) });
  // The event's metadata, from the rows the page reads in the same request
  // (`loadSpDeposit`, cached). An event older than those rows keeps the
  // deposit's title.
  const decoded = decodeEventId(eventId);
  const data = await loadSpDeposit(dep.id, pool.symbol, depositor);
  const row = data && data !== "missing" ? data.rows.find((r) => r.event_key === decoded) : undefined;
  return eventMetadata({
    ...meta,
    canonicalPath: `${canonical}/event/${encodeURIComponent(decoded)}`,
    event: row ? { actionLabel: spEventLabel(row), timestamp: Number(row.block_timestamp) } : null,
    description: row
      ? spEventPageDescription(pool.symbol, depositor, Number(row.block_timestamp), dep)
      : DESCRIPTION(dep),
    image: "explorer",
  });
}

/** The deposit page; under `event/<id>` the same body, whose view reads the
 *  id from the route and draws the one operation (P4). A pair the index has
 *  no row for is a 404. */
export async function ForkSpDepositPage({ fork, params }: SpDepositParams & { fork: LiquityForkDeployment }) {
  const dep = SP_DEPLOYMENTS[fork];
  const { collateralType: rawBranch, wallet: rawWallet } = await params;
  const { pool, depositor } = named(dep, rawBranch, rawWallet);
  if (!pool || !depositor) notFound();
  const initial = await loadSpDeposit(dep.id, pool.symbol, depositor);
  if (initial === "missing") notFound();
  // Under Focus the deposit is the fork's stablecoin and its branch's collateral.
  const keys = [assetKey(dep.chainId, dep.stable.address), assetKey(dep.chainId, pool.collateralAddr)];
  return (
    <AimGate keys={keys} chain={dep.chainId} what={`This ${dep.name} deposit`}>
      <SpDepositPage
        key={`${pool.symbol}:${depositor}`}
        dep={dep}
        branch={pool.symbol}
        depositor={depositor}
        initial={initial}
      />
    </AimGate>
  );
}

export function ForkSpDepositNotFound({ fork }: { fork: LiquityForkDeployment }) {
  const dep = SP_DEPLOYMENTS[fork];
  return (
    <RouteNotFound
      session={dep.session as SessionProtocol}
      heading="Not a deposit"
      backHref={dep.spPath}
      backLabel="Browse Stability Pool deposits"
    >
      A {dep.name} deposit is named by its branch ({branchList(dep).replace(/ and /, " or ")}) and the depositor&rsquo;s
      address. Either the URL does not carry that pair, or that address has made no deposit in that branch&rsquo;s pool.
    </RouteNotFound>
  );
}
