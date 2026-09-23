// Morpho Blue on Base — the protocol view (/base/morpho/markets): the roster
// at a glance, one row per loan token, read at one head block. The `views`
// cell of the Morpho Blue Base row.
//
// It sits BESIDE the positions listing at /base/morpho, the same shape as
// /ethereum/morpho/markets: the listing answers "who holds what here", this
// answers "what is the protocol". Until 2026-08-26 this view was the
// explorer's front door with a wallet lookup above it, because nothing stood
// behind the position set; the listing lane (rails-ops architecture/base-l2-
// lane.md §8) closed that gap and the lookup went with it.
//
// Two pages, not one: this overview draws no market rows at all. Each loan
// token's markets live at /base/morpho/markets/<loan token>, where a
// 720-market family can be one entry and a dust tail one disclosure.
//
// Server-rendered: a read-only aggregate with no interactivity to hydrate for,
// so the first paint carries the real figures.

import { MorphoMarketsOverview, MorphoMarketsStamp } from "@/components/protocol/morpho/morpho-markets-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { loadMorphoMarketsFromChain } from "@/lib/sources/chain/morpho-markets";
import { overviewData, stampOf } from "@/lib/morpho/markets-shape";
import { MORPHO_BASE_DEPLOYMENT } from "@/lib/sources/chain/morpho-deployments";
import { MORPHO_BASE_BLUE, MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { protocolForHref } from "@/lib/shared/protocols";
import { unlaunchedRobotsForPath } from "@/lib/shared/page-metadata";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import Link from "next/link";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { MORPHO_BASE_CASE_STUDY_VAULT } from "@/lib/morpho-base/vault-case-study";
import { morphoBaseVaultByAddress } from "@/lib/morpho-base/vault-catalog";
import { baseVaultHref, baseVaultRosterHref } from "@/lib/vaults/routes";

// ISR, ten minutes. This is a protocol aggregate, not a wallet's page: the
// same render serves every visitor, so re-reading the contracts per request
// bought nothing but RPC. Ten minutes is roughly fifty blocks of interest
// accrual on figures quoted to the nearest percent. The header stamp names the
// block the read happened at, so a cached page states its own age.
export const revalidate = 600;

export const metadata = {
  title: "Morpho Blue Markets on Base",
  description:
    "Every Morpho Blue market on Base, one row per loan token — what it is lent against, how much, how used, and the one loan-to-value that governs each market.",
  ...unlaunchedRobotsForPath("/base/morpho/markets"),
};

const PROTOCOL = protocolForHref("/base/morpho")!;

export default async function MorphoBaseMarketsPage() {
  // Straight to the reader rather than through this deployment's own
  // /api/chain/morpho-base/markets route — same code, one less hop.
  const data = await loadMorphoMarketsFromChain(MORPHO_BASE_DEPLOYMENT);

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Markets & the one number that governs them"
          stamp={
            <>
              <MorphoMarketsStamp data={stampOf(data)} chainId={MORPHO_BASE_CHAIN_ID} blue={MORPHO_BASE_BLUE} />
              {/* A MetaMorpho vault is a supplier ON these markets, so the
                  markets view is where a reader meets one; the vaults are the
                  next tab along on this same rail (rails-ops decision 0028).
                  This one address is a worked example — every catalogued vault
                  has the same page. */}
              <p className="mt-2">
                <Link href={baseVaultHref(MORPHO_BASE_CASE_STUDY_VAULT)} className={PAGE_LINK} prefetch={false}>
                  Vault exposure — {morphoBaseVaultByAddress(MORPHO_BASE_CASE_STUDY_VAULT)?.name ?? "MetaMorpho vault"}{" "}
                  (example) <span aria-hidden>→</span>
                </Link>
              </p>
              {/* The roster of every catalogued vault. */}
              <p className="mt-2">
                <Link href={baseVaultRosterHref()} className={PAGE_LINK} prefetch={false}>
                  All vaults on Base <span aria-hidden>→</span>
                </Link>
              </p>
            </>
          }
        />

        <div data-skel-section="page-table">
          <MorphoMarketsOverview data={overviewData(data)} chainId={MORPHO_BASE_CHAIN_ID} />
        </div>
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
