// The Liquity V2 forks' position kinds for a wallet search
// (components/shared/holder-kinds.tsx; rails-ops TO-DO-stability-pool-deposits
// §1b, §3.3): Troves and Stability Pool deposits, each read from its listing
// route. Each fork's listings draw their own kind's cards and pass the other
// kind to the shared sections.
//
// The fork Trove routes take no owner filter: the fork listings read every
// Trove once and search in memory (lib/<fork>/list-filter-dimensions.tsx), so
// the Troves kind reads the same set and keeps the wallet's: held now, last
// held, or held and moved on (formerHold, ui-jobs 715). The deposits kind reads
// the fork's /stability-pool?wallet=.

import { holderKind } from "@/components/shared/holder-kinds";
import { LiquityV2DepositCard } from "@/components/protocol/liquity/sp-deposit-card";
import { EbisuPositionCard, viewFromSummary as ebisuView } from "@/components/protocol/ebisu/ebisu-position-card";
import {
  AsymmetryPositionCard,
  viewFromSummary as asymmetryView,
} from "@/components/protocol/asymmetry/asymmetry-position-card";
import {
  BasedollarPositionCard,
  viewFromSummary as basedollarView,
} from "@/components/protocol/basedollar/basedollar-position-card";
import { fetchEbisuTroves } from "@/lib/api/fetch-ebisu-troves";
import { fetchAsymmetryTroves } from "@/lib/api/fetch-asymmetry-troves";
import { fetchBasedollarTroves } from "@/lib/api/fetch-basedollar-troves";
import type { EbisuTroveSummary } from "@/lib/sources/api/ebisu-troves";
import type { AsymmetryTroveSummary } from "@/lib/sources/api/asymmetry-troves";
import type { BasedollarTroveSummary } from "@/lib/sources/api/basedollar-troves";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";
import { formerHoldFor, type ForkFormerHolder } from "./former-holders";
import { recordedShutdown } from "@/lib/shared/liquity-family-shutdown";
import { branchShutdownState } from "./shutdown";
import type { LiquityForkDeployment } from "./explorer";
import { fetchSpPage, SP_LIST_DEFAULTS } from "@/lib/liquity-v2/sp-listing";
import {
  ASYMMETRY_SP,
  BASEDOLLAR_SP,
  EBISU_SP,
  spDepositHref,
  spPool,
  type SpDeployment,
} from "@/lib/liquity-v2/sp-deployment";
import type { ReactNode } from "react";

/** The fields of a fork Trove row the kinds read; the three summaries share them. */
export interface ForkTroveRow {
  id: string;
  status: string;
  isZombie?: boolean;
  collateralType: string;
  collateral: number;
  debt: number;
  lastActivityAt: number;
  owner: string | null;
  lastOwner: string | null;
  formerHolders?: ForkFormerHolder[];
  /** Set by the Troves kind where the wallet held the Trove and moved it on. */
  formerHold?: { movedTo: string; movedAt: number } | null;
}

/** One fork: its deposit pages' deployment and how its Troves read and draw. */
export interface ForkHolderSpec {
  dep: SpDeployment;
  /** Every Trove, with its former holders. */
  fetchTroves: (signal?: AbortSignal) => Promise<ForkTroveRow[]>;
  /** The Trove's listing card; `formerHold` marks one the searched wallet passed on. */
  troveCard: (t: ForkTroveRow, formerHold: ForkTroveRow["formerHold"]) => ReactNode;
  troveHref: (t: ForkTroveRow) => string;
}

const ALL = { sortBy: "debt", sortOrder: "desc", limit: 500, former: true } as const;

export const FORK_HOLDERS: Record<LiquityForkDeployment, ForkHolderSpec> = {
  ebisu: {
    dep: EBISU_SP,
    fetchTroves: (signal) => fetchEbisuTroves({ ...ALL, signal }).then((r) => r.data),
    troveCard: (t, formerHold) => {
      const s = t as unknown as EbisuTroveSummary;
      return <EbisuPositionCard v={{ ...ebisuView(s), formerHold: formerHold ?? null }} compact />;
    },
    troveHref: (t) => `${EBISU_SP.basePath}/${t.collateralType}/${t.id}`,
  },
  asymmetry: {
    dep: ASYMMETRY_SP,
    fetchTroves: (signal) => fetchAsymmetryTroves({ ...ALL, signal }).then((r) => r.data),
    troveCard: (t, formerHold) => {
      const s = t as unknown as AsymmetryTroveSummary;
      return <AsymmetryPositionCard v={{ ...asymmetryView(s), formerHold: formerHold ?? null }} compact />;
    },
    troveHref: (t) => `${ASYMMETRY_SP.basePath}/${t.collateralType}/${t.id}`,
  },
  basedollar: {
    dep: BASEDOLLAR_SP,
    fetchTroves: (signal) => fetchBasedollarTroves({ ...ALL, signal }).then((r) => r.data),
    troveCard: (t, formerHold) => {
      const s = t as unknown as BasedollarTroveSummary;
      return <BasedollarPositionCard v={{ ...basedollarView(s), formerHold: formerHold ?? null }} compact />;
    },
    troveHref: (t) => `${BASEDOLLAR_SP.basePath}/${t.collateralType}/${t.id}`,
  },
};

/** The wallet's Troves among every Trove: held now, last held, or held and
 *  moved on (marked `formerHold`), newest first. */
export function walletTroves(rows: ForkTroveRow[], wallet: string): ForkTroveRow[] {
  const w = wallet.toLowerCase();
  return rows
    .filter(
      (t) =>
        t.owner?.toLowerCase() === w ||
        t.lastOwner?.toLowerCase() === w ||
        (t.formerHolders?.some((f) => f.holder === w) ?? false),
    )
    .map((t) => ({ ...t, formerHold: formerHoldFor(t, w) }))
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

/** The Troves kind of a fork, for its Stability Pool listing. */
export const forkTroveKind = (fork: LiquityForkDeployment) => {
  const f = FORK_HOLDERS[fork];
  return holderKind<ForkTroveRow>({
    id: "trove",
    heading: "Troves",
    listingPath: f.dep.basePath,
    read: (wallet, signal) =>
      f.fetchTroves(signal).then((all) => {
        const rows = walletTroves(all, wallet);
        return { rows, total: rows.length, passedOn: rows.filter((t) => t.formerHold).length };
      }),
    renderCard: (t) => f.troveCard(t, t.formerHold),
    hrefFor: f.troveHref,
    keyFor: (t) => `${t.collateralType}-${t.id}`,
  });
};

/** A shut-down branch's state from its catalog record, for a listing card
 *  (the deposit page adds the live read, hooks/useBranchShutdown.ts). */
export const recordedBranchShutdown = (dep: SpDeployment, collateralType: string) =>
  branchShutdownState(recordedShutdown(dep.id, collateralType), null);

/** A fork deposit's listing card. */
export const forkDepositListingCard = (dep: SpDeployment) => (r: LiquityV2DepositRow<string>) => (
  <LiquityV2DepositCard row={r} surface="listing" dep={dep} shutdown={recordedBranchShutdown(dep, r.collateral_type)} />
);

/** The Stability Pool deposits kind of a fork, for its Troves listing. */
export const forkDepositKind = (fork: LiquityForkDeployment) => {
  const dep = FORK_HOLDERS[fork].dep;
  return holderKind<LiquityV2DepositRow<string>>({
    id: "deposit",
    heading: "Stability Pool deposits",
    listingPath: dep.spPath,
    // An address names a depositor, so the page is every status, newest first.
    read: (wallet, signal) =>
      fetchSpPage<string>({ ...SP_LIST_DEFAULTS, q: wallet }, 1, { signal }, dep).then((r) => ({
        rows: r.data,
        total: r.total,
      })),
    renderCard: forkDepositListingCard(dep),
    hrefFor: (r) => spDepositHref(dep, r.collateral_type, r.depositor),
    keyFor: (r) => `${r.collateral_type}:${r.depositor}`,
  });
};

/** A branch's collateral address, for the strip's icons. */
export const forkCollAddress = (dep: SpDeployment) => (collateralType: string) =>
  spPool(dep, collateralType)?.collateralAddr;
