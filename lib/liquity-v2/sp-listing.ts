// The Liquity V2 Stability Pool listing beside the Troves, and each fork's
// (lib/liquity-v2/sp-deployment.ts): server-driven, as
// the Trove listing is. The selection maps onto /api/liquity-v2/stability-pool
// params and rails-server filters, sorts and pages. Polaris's deposit listing
// (lib/polaris/sp-loan-listing.ts) is the shape.
//
// The search box reads a depositor: an address, or an ENS name resolved here
// first (lib/liquity-v2/search.ts parses it; a Trove id names no deposit).
// Status is Open / Closed / All (ui-jobs 805, sp-visibility.ts): naming a
// depositor rests it on All. The Collateral sort appears once a branch is
// chosen: the three branches pay different tokens. Deposit and Yield are BOLD
// on every branch.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { BaseListFilters, SerializableDimension } from "@/lib/shared/list-filter";
import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { resolveEnsViaApi } from "@/lib/shared/listing-search";
import { readStatusParam, STATUS_CHOICE_OPTIONS } from "@/lib/shared/status-choice";
import { parseTroveSearch } from "./search";
import { defaultStatusChoice, statusChoice, statusParam } from "./sp-visibility";
import { SP_BRANCHES } from "./sp-routes";
import { LIQUITY_V2_SP, spPool, type SpDeployment } from "./sp-deployment";
import {
  readLiquityV2Sp,
  type LiquityV2DepositListResponse,
  type LiquityV2DepositRow,
} from "@/lib/sources/api/liquity-v2-sp";

/** Rows a page; the route takes at most 500. */
export const SP_ITEMS_PER_PAGE = 20;

export interface SpListFilters extends BaseListFilters {
  branch: string[];
  /** One of open / closed / all, or [] for the resting choice (ui-jobs 805). */
  status: string[];
  tx: string[];
}

export const SP_LIST_DEFAULTS: SpListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  branch: [],
  status: [],
  tx: [],
};

export const SP_BRANCH_OPTIONS: FilterOptionDef[] = SP_BRANCHES.map((b) => ({ value: b, label: b }));

export function spListDimensions(
  branchOptions: FilterOptionDef[] = SP_BRANCH_OPTIONS,
): SerializableDimension<SpListFilters>[] {
  return [
    {
      id: "status",
      label: "Status",
      group: "Status",
      cardinality: "single",
      param: "status",
      options: STATUS_CHOICE_OPTIONS,
      segmented: true,
      get: (f) => [statusChoice(f)],
      defaultValues: (f) => [defaultStatusChoice(f)],
      // Takes the choice, or an old link's list of statuses (ui-jobs 805).
      set: (f, v) => {
        const choice = readStatusParam(v).choice ?? defaultStatusChoice(f);
        return { ...f, status: choice === defaultStatusChoice(f) ? [] : [choice] };
      },
    },
    {
      id: "branch",
      label: "Branch",
      group: "Branch",
      cardinality: "single",
      param: "collateralType",
      options: branchOptions,
      get: (f) => f.branch,
      set: (f, v) => ({ ...f, branch: v }),
    },
    transactionsDimension<SpListFilters>({ get: (f) => f.tx, set: (f, tx) => ({ ...f, tx }), top: 2_000 }),
  ];
}

/** The sorts; `dep` (Liquity V2 by default) decides whether the branch the
 *  selection names is one of its own. */
export function spSortOptions(f: SpListFilters, dep: SpDeployment = LIQUITY_V2_SP): SortOption[] {
  const base: SortOption[] = [
    { value: "recent", label: RECENT_ACTIVITY_LABEL },
    { value: "deposit", label: "Deposit" },
    { value: "yield", label: "Yield" },
  ];
  if (spPool(dep, f.branch[0])) base.push({ value: "coll", label: "Collateral" });
  base.push({ value: "tx", label: "Transactions" });
  return base;
}

interface Hop {
  baseUrl?: string;
  signal?: AbortSignal;
  headers?: HeadersInit;
  /** Rows asked for; a page's worth by default (one for a draft's count). */
  limit?: number;
}

/** The depositor the search names, as an address: an ENS name resolves first.
 *  `null` is a name that resolves to nothing, and the page is empty. */
async function depositorOf(q: string, hop: Hop): Promise<string | undefined | null> {
  const { ownerAddress, ownerEns } = parseTroveSearch(q);
  if (ownerAddress) return ownerAddress.toLowerCase();
  if (ownerEns) return (await resolveEnsViaApi(ownerEns, hop.baseUrl, hop.signal))?.toLowerCase() ?? null;
  return undefined;
}

/** The route's params for a selection: the sort falls back to recent where it
 *  needs a branch the selection does not name. */
export function spListParams(
  f: SpListFilters,
  page: number,
  wallet: string | undefined,
  dep: SpDeployment = LIQUITY_V2_SP,
  limit: number = SP_ITEMS_PER_PAGE,
): Record<string, string | undefined> {
  const branch = spPool(dep, f.branch[0])?.symbol;
  const sortBy = spSortOptions(f, dep).some((o) => o.value === f.sortBy) ? f.sortBy : "recent";
  const { minTx, maxTx } = transactionBounds(f.tx);
  return {
    collateralType: branch,
    wallet,
    status: statusParam(f),
    minTx: minTx?.toString(),
    maxTx: maxTx?.toString(),
    sortBy,
    sortOrder: f.sortOrder,
    limit: String(limit),
    offset: String((page - 1) * limit),
  };
}

/** One page of the deployment's deposits (Liquity V2's by default). */
export async function fetchSpPage<B extends string = LiquityV2DepositRow["collateral_type"]>(
  filters: SpListFilters,
  page: number,
  hop: Hop = {},
  dep: SpDeployment = LIQUITY_V2_SP,
): Promise<{ data: LiquityV2DepositRow<B>[]; total: number }> {
  const wallet = await depositorOf(filters.q, hop);
  if (wallet === null) return { data: [], total: 0 };
  const r = await readLiquityV2Sp<LiquityV2DepositListResponse<B>>(
    "stability-pool",
    spListParams(filters, page, wallet, dep, hop.limit),
    { baseUrl: hop.baseUrl, headers: hop.headers, signal: hop.signal, api: dep.api },
  );
  return { data: r.rows, total: r.pagination.total };
}
