// The Liquity V1 Stability Pool listing beside the Troves: server-driven, as
// Liquity V2's deposit listing is (lib/liquity-v2/sp-listing.ts). The
// selection maps onto /api/liquity-v1/stability-pool params and rails-server
// filters, sorts and pages.
//
// The search box reads a depositor: an address, or an ENS name resolved here
// first. Status is Open / Closed / All (ui-jobs 805, sp-staking-visibility.ts):
// naming a depositor rests it on All. One pool, so no branch dimension.

import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { BaseListFilters, SerializableDimension } from "@/lib/shared/list-filter";
import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { parseListingSearch, resolveEnsViaApi } from "@/lib/shared/listing-search";
import { readStatusParam, STATUS_CHOICE_OPTIONS } from "@/lib/shared/status-choice";
import { defaultStatusChoice, namesWallet, statusChoice, statusParam } from "./sp-staking-visibility";
import {
  readLiquityV1Sp,
  type LiquityV1DepositListResponse,
  type LiquityV1DepositRow,
} from "@/lib/sources/api/liquity-v1-sp";

/** Rows a page; the route takes at most 500. */
export const SP_ITEMS_PER_PAGE = 20;

export interface SpListFilters extends BaseListFilters {
  /** One of open / closed / all, or [] for the resting choice (ui-jobs 805). */
  status: string[];
  tx: string[];
}

export const SP_LIST_DEFAULTS: SpListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  tx: [],
};

/** True when the query names a depositor (an address or an ENS name). */
export const namesDepositor = namesWallet;

export function spListDimensions(): SerializableDimension<SpListFilters>[] {
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
    transactionsDimension<SpListFilters>({ get: (f) => f.tx, set: (f, tx) => ({ ...f, tx }), top: 2_000 }),
  ];
}

export function spSortOptions(): SortOption[] {
  return [
    { value: "recent", label: RECENT_ACTIVITY_LABEL },
    { value: "deposit", label: "Deposit" },
    { value: "eth", label: "ETH paid" },
    { value: "lqty", label: "LQTY paid" },
    { value: "tx", label: "Transactions" },
  ];
}

interface Hop {
  baseUrl?: string;
  signal?: AbortSignal;
  headers?: HeadersInit;
  /** Rows asked for; a page's worth by default (one for a draft's count). */
  limit?: number;
}

/** The depositor the search names, as an address: an ENS name resolves first.
 *  `null` is a query that names no one, and the page is empty. */
async function depositorOf(q: string, hop: Hop): Promise<string | undefined | null> {
  const s = parseListingSearch(q, false);
  if (s.kind === "none") return undefined;
  if (s.kind === "address") return s.address;
  if (s.kind === "ens") return (await resolveEnsViaApi(s.name, hop.baseUrl, hop.signal))?.toLowerCase() ?? null;
  return null;
}

/** The route's params for a selection. */
export function spListParams(
  f: SpListFilters,
  page: number,
  wallet: string | undefined,
  limit: number = SP_ITEMS_PER_PAGE,
): Record<string, string | undefined> {
  const sortBy = spSortOptions().some((o) => o.value === f.sortBy) ? f.sortBy : "recent";
  const { minTx, maxTx } = transactionBounds(f.tx);
  return {
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

export async function fetchSpPage(
  filters: SpListFilters,
  page: number,
  hop: Hop = {},
): Promise<{ data: LiquityV1DepositRow[]; total: number }> {
  const wallet = await depositorOf(filters.q, hop);
  if (wallet === null) return { data: [], total: 0 };
  const r = await readLiquityV1Sp<LiquityV1DepositListResponse>(
    "stability-pool",
    spListParams(filters, page, wallet, hop.limit),
    {
      baseUrl: hop.baseUrl,
      headers: hop.headers,
      signal: hop.signal,
    },
  );
  return { data: r.rows, total: r.pagination.total };
}
