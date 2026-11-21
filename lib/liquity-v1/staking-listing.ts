// The Liquity V1 LQTY stake listing beside the Troves and the deposits:
// server-driven, as the deposit listing is (sp-listing.ts). The selection maps
// onto /api/liquity-v1/staking params and rails-server filters, sorts and
// pages.
//
// The search box reads a staker: an address, or an ENS name resolved here
// first. Naming one relaxes the resting Status default (Open) to every
// status, as the Trove listing does.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { BaseListFilters, SerializableDimension } from "@/lib/shared/list-filter";
import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { parseListingSearch, resolveEnsViaApi } from "@/lib/shared/listing-search";
import {
  readLiquityV1Staking,
  type LiquityV1StakeListResponse,
  type LiquityV1StakeRow,
} from "@/lib/sources/api/liquity-v1-staking";

/** Rows a page; the route takes at most 500. */
export const ST_ITEMS_PER_PAGE = 20;

export interface StListFilters extends BaseListFilters {
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

const STATUSES = ["open", "closed"] as const;
const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

/** True when the query names a staker (an address or an ENS name). */
export function namesStaker(q: string | undefined): boolean {
  const s = parseListingSearch(q ?? "", false);
  return s.kind === "address" || s.kind === "ens";
}

/** Open while browsing, every status once the search names a staker. */
const defaultStatuses = (f: { q?: string }): string[] => (namesStaker(f.q) ? [...STATUSES] : ["open"]);
const canonical = (v: string[]) => STATUSES.filter((s) => v.includes(s));
const effectiveStatuses = (f: { q?: string; status: string[] }): string[] => {
  const sel = canonical(f.status);
  return sel.length > 0 ? sel : defaultStatuses(f);
};

export function stListDimensions(): SerializableDimension<StListFilters>[] {
  return [
    {
      id: "status",
      label: "Status",
      group: "Status",
      cardinality: "multi",
      param: "status",
      options: STATUS_OPTIONS,
      get: (f) => effectiveStatuses(f),
      defaultValues: (f) => defaultStatuses(f),
      defaultChip: (f) => (defaultStatuses(f).length < STATUSES.length ? "Status: Open" : null),
      clearDefault: (f) => ({ ...f, status: [...STATUSES] }),
      set: (f, v) => {
        const sel = canonical(v);
        const def = defaultStatuses(f);
        const same = sel.length === def.length && sel.every((s) => def.includes(s));
        return { ...f, status: sel.length === 0 || same ? [] : sel };
      },
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
): Record<string, string | undefined> {
  const sortBy = stSortOptions().some((o) => o.value === f.sortBy) ? f.sortBy : "recent";
  const statuses = effectiveStatuses(f);
  const { minTx, maxTx } = transactionBounds(f.tx);
  return {
    wallet,
    status: statuses.length === STATUSES.length ? undefined : statuses.join(","),
    minTx: minTx?.toString(),
    maxTx: maxTx?.toString(),
    sortBy,
    sortOrder: f.sortOrder,
    limit: String(ST_ITEMS_PER_PAGE),
    offset: String((page - 1) * ST_ITEMS_PER_PAGE),
  };
}

export async function fetchStakePage(
  filters: StListFilters,
  page: number,
  hop: Hop = {},
): Promise<{ data: LiquityV1StakeRow[]; total: number }> {
  const wallet = await stakerOf(filters.q, hop);
  if (wallet === null) return { data: [], total: 0 };
  const r = await readLiquityV1Staking<LiquityV1StakeListResponse>("staking", stListParams(filters, page, wallet), {
    baseUrl: hop.baseUrl,
    headers: hop.headers,
    signal: hop.signal,
  });
  return { data: r.rows, total: r.pagination.total };
}
