"use client";

// A Stability Pool deposit listing on Liquity V2 or one of its forks
// (lib/liquity-v2/sp-deployment.ts) — the client half: the shared listing
// driver with the deposit card's listing render. A deposit is (branch,
// depositor), so the href and key are the pair. A wallet search reads the
// deployment's other kinds (its Troves) under the rows, and the deployment's
// strip counts the wallet across them (rails-ops TO-DO-stability-pool-deposits
// §1b).

import { useMemo, type ReactNode } from "react";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { RailHeader } from "@/components/shared/rail-header";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import {
  HolderKinds,
  useHolderKinds,
  type AnyHolderKind,
  type HolderKindReads,
} from "@/components/shared/holder-kinds";
import { readListQuery } from "@/lib/shared/list-filter";
import { useUrlSearchParams } from "@/lib/shared/use-url-search-params";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { spDepositHref, type SpDeployment } from "@/lib/liquity-v2/sp-deployment";
import {
  fetchSpPage,
  namesDepositor,
  spListDimensions,
  spSortOptions,
  SP_ITEMS_PER_PAGE,
  SP_LIST_DEFAULTS,
  type SpListFilters,
} from "@/lib/liquity-v2/sp-listing";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";

export interface SpDepositListingProps {
  initialItems?: LiquityV2DepositRow<string>[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function SpDepositListing({
  dep,
  title,
  renderCard,
  otherKinds,
  strip,
  ...props
}: SpDepositListingProps & {
  dep: SpDeployment;
  title: string;
  renderCard: (r: LiquityV2DepositRow<string>) => ReactNode;
  /** The deployment's other kinds, read for a wallet search. */
  otherKinds: AnyHolderKind[];
  /** The wallet's strip, from the deposits on the page and the other kinds'
   *  reads; null until it can be stated. Called only where the search names
   *  a depositor and no pill narrows the rows. */
  strip: (items: LiquityV2DepositRow<string>[], total: number, f: SpListFilters, reads: HolderKindReads) => ReactNode;
}) {
  const branchOptions = useMemo<FilterOptionDef[]>(
    () =>
      dep.pools.map((p) => ({
        value: p.symbol,
        label: p.symbol,
        icon: <TokenChipIcon symbol={p.symbol} address={p.collateralAddr} size={20} filterable={false} />,
      })),
    [dep],
  );
  const { wallet, reads } = useHolderKinds(otherKinds, readListQuery(useUrlSearchParams(props.initialSearch ?? "")));

  // The strip states the wallet: the search names a depositor and no pill
  // narrows the rows.
  const holderStrip = (items: LiquityV2DepositRow<string>[], total: number, f: SpListFilters) =>
    !namesDepositor(f.q) || f.status.length || f.branch.length || f.tx.length ? null : strip(items, total, f, reads);

  return (
    <ChainTruthListingPage<LiquityV2DepositRow<string>, SpListFilters>
      title={title}
      noun="Deposits"
      basePath={dep.spPath}
      identity={<RailHeader session={dep.session as SessionProtocol} venue="subPage" stamp />}
      titleHidden
      defaults={SP_LIST_DEFAULTS}
      sortOptions={(f) => spSortOptions(f, dep)}
      searchPlaceholder="Depositor address or ENS"
      renderCard={renderCard}
      hrefFor={(r) => spDepositHref(dep, r.collateral_type, r.depositor)}
      keyFor={(r) => `${r.collateral_type}:${r.depositor}`}
      strategy={serverStrategy<LiquityV2DepositRow<string>, SpListFilters>({
        dimensions: spListDimensions(branchOptions),
        itemsPerPage: SP_ITEMS_PER_PAGE,
        fetchPage: (f, page) => fetchSpPage<string>(f, page, {}, dep),
      })}
      renderAbove={({ items, total, filters }) => holderStrip(items, total, filters)}
      renderBelow={() => <HolderKinds kinds={otherKinds} reads={reads} wallet={wallet} />}
      {...props}
    />
  );
}
