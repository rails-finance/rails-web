// The Liquity V2 Stability Pool listing beside the Troves: server-driven, as
// the Trove listing is. The selection maps onto /api/liquity-v2/stability-pool
// params and rails-server filters, sorts and pages. Polaris's deposit listing
// (lib/polaris/sp-loan-listing.ts) is the shape.
//
// The search box reads a depositor: an address, or an ENS name resolved here
// first (lib/liquity-v2/search.ts parses it; a Trove id names no deposit).
// Naming one relaxes the resting Status default (Open) to every status, the
// Trove listing's middle path. The Collateral sort appears once a branch is
// chosen: the three branches pay different tokens. Deposit and Yield are BOLD
// on every branch.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { BaseListFilters, SerializableDimension } from "@/lib/shared/list-filter";
import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { resolveEnsViaApi } from "@/lib/shared/listing-search";
import { parseTroveSearch } from "./search";
import { normalizeSpBranch, SP_BRANCHES } from "./sp-routes";
import {
  readLiquityV2Sp,
  type LiquityV2DepositListResponse,
  type LiquityV2DepositRow,
} from "@/lib/sources/api/liquity-v2-sp";

/** Rows a page; the route takes at most 500. */
export const SP_ITEMS_PER_PAGE = 20;

export interface SpListFilters extends BaseListFilters {
  branch: string[];
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

const STATUSES = ["open", "closed"] as const;
const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

/** True when the query names a depositor (an address or an ENS name). */
export function namesDepositor(q: string | undefined): boolean {
  const { ownerAddress, ownerEns } = parseTroveSearch(q ?? "");
  return Boolean(ownerAddress ?? ownerEns);
}

/** Open while browsing, every status once the search names a depositor. */
const defaultStatuses = (f: { q?: string }): string[] => (namesDepositor(f.q) ? [...STATUSES] : ["open"]);
const canonical = (v: string[]) => STATUSES.filter((s) => v.includes(s));
const effectiveStatuses = (f: { q?: string; status: string[] }): string[] => {
  const sel = canonical(f.status);
  return sel.length > 0 ? sel : defaultStatuses(f);
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

export function spSortOptions(f: SpListFilters): SortOption[] {
  const base: SortOption[] = [
    { value: "recent", label: RECENT_ACTIVITY_LABEL },
    { value: "deposit", label: "Deposit" },
    { value: "yield", label: "Yield" },
  ];
  if (normalizeSpBranch(f.branch[0])) base.push({ value: "coll", label: "Collateral" });
  base.push({ value: "tx", label: "Transactions" });
  return base;
}

interface Hop {
  baseUrl?: string;
  signal?: AbortSignal;
  headers?: HeadersInit;
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
): Record<string, string | undefined> {
  const branch = normalizeSpBranch(f.branch[0]) ?? undefined;
  const sortBy = spSortOptions(f).some((o) => o.value === f.sortBy) ? f.sortBy : "recent";
  const statuses = effectiveStatuses(f);
  const { minTx, maxTx } = transactionBounds(f.tx);
  return {
    collateralType: branch,
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
): Promise<{ data: LiquityV2DepositRow[]; total: number }> {
  const wallet = await depositorOf(filters.q, hop);
  if (wallet === null) return { data: [], total: 0 };
  const r = await readLiquityV2Sp<LiquityV2DepositListResponse>("stability-pool", spListParams(filters, page, wallet), {
    baseUrl: hop.baseUrl,
    headers: hop.headers,
    signal: hop.signal,
  });
  return { data: r.rows, total: r.pagination.total };
}
