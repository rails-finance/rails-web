// The Liquity V1 Stability Pool listing beside the Troves: server-driven, as
// Liquity V2's deposit listing is (lib/liquity-v2/sp-listing.ts). The
// selection maps onto /api/liquity-v1/stability-pool params and rails-server
// filters, sorts and pages.
//
// The search box reads a depositor: an address, or an ENS name resolved here
// first. Naming one relaxes the resting Status default (Open) to every
// status, as the Trove listing does. One pool, so no branch dimension.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { BaseListFilters, SerializableDimension } from "@/lib/shared/list-filter";
import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { parseListingSearch, resolveEnsViaApi } from "@/lib/shared/listing-search";
import {
  readLiquityV1Sp,
  type LiquityV1DepositListResponse,
  type LiquityV1DepositRow,
} from "@/lib/sources/api/liquity-v1-sp";

/** Rows a page; the route takes at most 500. */
export const SP_ITEMS_PER_PAGE = 20;

export interface SpListFilters extends BaseListFilters {
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

const STATUSES = ["open", "closed"] as const;
const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

/** True when the query names a depositor (an address or an ENS name). */
export function namesDepositor(q: string | undefined): boolean {
  const s = parseListingSearch(q ?? "", false);
  return s.kind === "address" || s.kind === "ens";
}

/** Open while browsing, every status once the search names a depositor. */
const defaultStatuses = (f: { q?: string }): string[] => (namesDepositor(f.q) ? [...STATUSES] : ["open"]);
const canonical = (v: string[]) => STATUSES.filter((s) => v.includes(s));
const effectiveStatuses = (f: { q?: string; status: string[] }): string[] => {
  const sel = canonical(f.status);
  return sel.length > 0 ? sel : defaultStatuses(f);
};

export function spListDimensions(): SerializableDimension<SpListFilters>[] {
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
): Record<string, string | undefined> {
  const sortBy = spSortOptions().some((o) => o.value === f.sortBy) ? f.sortBy : "recent";
  const statuses = effectiveStatuses(f);
  const { minTx, maxTx } = transactionBounds(f.tx);
  return {
    wallet,
    status: statuses.length === STATUSES.length ? undefined : statuses.join(","),
    minTx: minTx?.toString(),
    maxTx: maxTx?.toString(),
    sortBy,
    sortOrder: f.sortOrder,
    limit: String(SP_ITEMS_PER_PAGE),
    offset: String((page - 1) * SP_ITEMS_PER_PAGE),
  };
}

export async function fetchSpPage(
  filters: SpListFilters,
  page: number,
  hop: Hop = {},
): Promise<{ data: LiquityV1DepositRow[]; total: number }> {
  const wallet = await depositorOf(filters.q, hop);
  if (wallet === null) return { data: [], total: 0 };
  const r = await readLiquityV1Sp<LiquityV1DepositListResponse>("stability-pool", spListParams(filters, page, wallet), {
    baseUrl: hop.baseUrl,
    headers: hop.headers,
    signal: hop.signal,
  });
  return { data: r.rows, total: r.pagination.total };
}
