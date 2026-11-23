// The Liquity V1 LQTY stake listing beside the Troves and the deposits:
// server-driven, as the deposit listing is (sp-listing.ts). The selection maps
// onto /api/liquity-v1/staking params and rails-server filters, sorts and
// pages.
//
// The search box reads a staker: an address, or an ENS name resolved here
// first. Status is Open / Closed / All (ui-jobs 805, sp-staking-visibility.ts):
// naming a staker rests it on All.

import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { BaseListFilters, SerializableDimension } from "@/lib/shared/list-filter";
import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { parseListingSearch, resolveEnsViaApi } from "@/lib/shared/listing-search";
import { setStatusChoice, STATUS_CHOICE_OPTIONS } from "@/lib/shared/status-choice";
import { defaultStatusChoice, namesWallet, statusChoice, statusParam } from "./sp-staking-visibility";
import {
  readLiquityV1Staking,
  type LiquityV1StakeListResponse,
  type LiquityV1StakeRow,
} from "@/lib/sources/api/liquity-v1-staking";

/** Rows a page; the route takes at most 500. */
export const ST_ITEMS_PER_PAGE = 20;

export interface StListFilters extends BaseListFilters {
  /** One of open / closed / all, or [] for the resting choice (ui-jobs 805). */
  status: string[];
  tx: string[];
}

export const ST_LIST_DEFAULTS: StListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  tx: [],
};

/** True when the query names a staker (an address or an ENS name). */
export const namesStaker = namesWallet;

export function stListDimensions(): SerializableDimension<StListFilters>[] {
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
      set: (f, v) => ({ ...f, status: setStatusChoice(v, defaultStatusChoice(f), []).status }),
    },
    transactionsDimension<StListFilters>({ get: (f) => f.tx, set: (f, tx) => ({ ...f, tx }), top: 2_000 }),
  ];
}

export function stSortOptions(): SortOption[] {
  return [
    { value: "recent", label: RECENT_ACTIVITY_LABEL },
    { value: "stake", label: "Stake" },
    { value: "lusd", label: "LUSD paid" },
    { value: "eth", label: "ETH paid" },
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

/** The staker the search names, as an address: an ENS name resolves first.
 *  `null` is a query that names no one, and the page is empty. */
async function stakerOf(q: string, hop: Hop): Promise<string | undefined | null> {
  const s = parseListingSearch(q, false);
  if (s.kind === "none") return undefined;
  if (s.kind === "address") return s.address;
  if (s.kind === "ens") return (await resolveEnsViaApi(s.name, hop.baseUrl, hop.signal))?.toLowerCase() ?? null;
  return null;
}

/** The route's params for a selection. */
export function stListParams(
  f: StListFilters,
  page: number,
  wallet: string | undefined,
  limit: number = ST_ITEMS_PER_PAGE,
): Record<string, string | undefined> {
  const sortBy = stSortOptions().some((o) => o.value === f.sortBy) ? f.sortBy : "recent";
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

export async function fetchStakePage(
  filters: StListFilters,
  page: number,
  hop: Hop = {},
): Promise<{ data: LiquityV1StakeRow[]; total: number }> {
  const wallet = await stakerOf(filters.q, hop);
  if (wallet === null) return { data: [], total: 0 };
  const r = await readLiquityV1Staking<LiquityV1StakeListResponse>(
    "staking",
    stListParams(filters, page, wallet, hop.limit),
    {
      baseUrl: hop.baseUrl,
      headers: hop.headers,
      signal: hop.signal,
    },
  );
  return { data: r.rows, total: r.pagination.total };
}
