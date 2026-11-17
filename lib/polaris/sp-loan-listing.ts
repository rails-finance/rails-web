// The two sub-page listings beside the CDPs: Stability Pool deposits and
// reserve loans. Server-driven, as the CDP listing is: the selection maps
// onto /api/polaris/stability-pool or /api/polaris/reserve-loans params and
// rails-server filters, sorts and pages.
//
// The search box reads what the CDP listing's does (lib/polaris/search.ts): a
// number (a deposit names its market first, "usdp:40"; a bare number reads
// both pools), a holder address, or an ENS name, resolved here first. Naming
// one relaxes the resting Status default (Open) to every status, the CDP
// listing's middle path. Deposit and Gain sorts appear once a market is
// chosen: the two pools' deposits are different tokens.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { BaseListFilters, SerializableDimension } from "@/lib/shared/list-filter";
import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { resolveEnsViaApi } from "@/lib/shared/listing-search";
import { normalizeMarket, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { namesIdentity, parsePolarisSearch } from "@/lib/polaris/search";
import {
  readPolarisSpLoans,
  type PolarisDepositListResponse,
  type PolarisDepositRow,
  type PolarisLoanListResponse,
  type PolarisLoanRow,
} from "@/lib/sources/api/polaris-sp-loans";

/** Rows a page; the routes take at most 500. */
export const SP_LOAN_ITEMS_PER_PAGE = 20;

export interface PolarisDepositFilters extends BaseListFilters {
  market: string[];
  status: string[];
  vault: string[];
  tx: string[];
}

export interface PolarisLoanFilters extends BaseListFilters {
  status: string[];
  tx: string[];
}

export const DEPOSIT_LIST_DEFAULTS: PolarisDepositFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  market: [],
  status: [],
  vault: [],
  tx: [],
};

export const LOAN_LIST_DEFAULTS: PolarisLoanFilters = {
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

/** Open while browsing, every status once the search names a holder or a number. */
const defaultStatuses = (f: { q?: string }): string[] => (namesIdentity(f.q) ? [...STATUSES] : ["open"]);
const canonical = (v: string[]) => STATUSES.filter((s) => v.includes(s));
export const effectiveStatuses = (f: { q?: string; status: string[] }): string[] => {
  const sel = canonical(f.status);
  return sel.length > 0 ? sel : defaultStatuses(f);
};

function statusDimension<F extends BaseListFilters & { status: string[] }>(): SerializableDimension<F> {
  return {
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
  };
}

export const SP_MARKET_OPTIONS: FilterOptionDef[] = [
  { value: "usdp", label: "USDp" },
  { value: "goldp", label: "GOLDp" },
];

export function depositListDimensions(
  marketOptions: FilterOptionDef[] = SP_MARKET_OPTIONS,
): SerializableDimension<PolarisDepositFilters>[] {
  return [
    statusDimension<PolarisDepositFilters>(),
    {
      id: "market",
      label: "Market",
      group: "Market",
      cardinality: "single",
      param: "market",
      options: marketOptions,
      get: (f) => f.market,
      set: (f, v) => ({ ...f, market: v }),
    },
    {
      id: "vault",
      label: "Vault-held",
      group: "Vault-held",
      cardinality: "single",
      param: "vault",
      options: [
        { value: "1", label: "Held by a vault" },
        { value: "0", label: "Held by a wallet" },
      ],
      get: (f) => f.vault,
      set: (f, v) => ({ ...f, vault: v }),
    },
    transactionsDimension<PolarisDepositFilters>({ get: (f) => f.tx, set: (f, tx) => ({ ...f, tx }), top: 20_000 }),
  ];
}

export function loanListDimensions(): SerializableDimension<PolarisLoanFilters>[] {
  return [
    statusDimension<PolarisLoanFilters>(),
    transactionsDimension<PolarisLoanFilters>({ get: (f) => f.tx, set: (f, tx) => ({ ...f, tx }), top: 300 }),
  ];
}

export function depositSortOptions(f: PolarisDepositFilters): SortOption[] {
  const base: SortOption[] = [{ value: "recent", label: RECENT_ACTIVITY_LABEL }];
  if (normalizeMarket(f.market[0])) base.push({ value: "deposit", label: "Deposit" }, { value: "gain", label: "Gain" });
  base.push({ value: "tx", label: "Transactions" });
  return base;
}

export const LOAN_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
  { value: "cost", label: "Cost" },
  { value: "tx", label: "Transactions" },
];

interface Hop {
  baseUrl?: string;
  signal?: AbortSignal;
  headers?: HeadersInit;
}

/** The holder the search names, as an address: an ENS name resolves first.
 *  `null` is a name that resolves to nothing, and the page is empty. */
async function holderOf(q: string, hop: Hop): Promise<string | undefined | null> {
  const { ownerAddress, ownerEns } = parsePolarisSearch(q);
  if (ownerAddress) return ownerAddress.toLowerCase();
  if (ownerEns) return (await resolveEnsViaApi(ownerEns, hop.baseUrl, hop.signal))?.toLowerCase() ?? null;
  return undefined;
}

const statusParam = (f: { q: string; status: string[] }) => {
  const s = effectiveStatuses(f);
  return s.length === STATUSES.length ? undefined : s.join(",");
};

export async function fetchDepositPage(
  filters: PolarisDepositFilters,
  page: number,
  hop: Hop = {},
): Promise<{ data: PolarisDepositRow[]; total: number }> {
  const wallet = await holderOf(filters.q, hop);
  if (wallet === null) return { data: [], total: 0 };
  const parsed = parsePolarisSearch(filters.q);
  const market = parsed.market ?? normalizeMarket(filters.market[0]) ?? undefined;
  const sortBy =
    filters.sortBy === "deposit" || filters.sortBy === "gain"
      ? market
        ? filters.sortBy
        : "recent"
      : filters.sortBy === "tx"
        ? "tx"
        : "recent";
  const { minTx, maxTx } = transactionBounds(filters.tx);
  const params = {
    wallet,
    status: statusParam(filters),
    vaultHeld: filters.vault[0],
    minTx: minTx?.toString(),
    maxTx: maxTx?.toString(),
    sortBy,
    sortOrder: filters.sortOrder,
    limit: String(SP_LOAN_ITEMS_PER_PAGE),
    offset: String((page - 1) * SP_LOAN_ITEMS_PER_PAGE),
  };
  const opts = { baseUrl: hop.baseUrl, headers: hop.headers, signal: hop.signal };
  // A token id is per pool: a bare number reads both.
  const markets: (PolarisMarket | undefined)[] = parsed.cdpId && !market ? ["usdp", "goldp"] : [market];
  const answers = await Promise.all(
    markets.map((m) =>
      readPolarisSpLoans<PolarisDepositListResponse>(
        "stability-pool",
        { ...params, market: m, id: parsed.cdpId },
        opts,
      ),
    ),
  );
  return {
    data: answers.flatMap((a) => a.rows),
    total: answers.reduce((n, a) => n + a.pagination.total, 0),
  };
}

export async function fetchLoanPage(
  filters: PolarisLoanFilters,
  page: number,
  hop: Hop = {},
): Promise<{ data: PolarisLoanRow[]; total: number }> {
  const wallet = await holderOf(filters.q, hop);
  if (wallet === null) return { data: [], total: 0 };
  const { cdpId } = parsePolarisSearch(filters.q);
  const { minTx, maxTx } = transactionBounds(filters.tx);
  const r = await readPolarisSpLoans<PolarisLoanListResponse>(
    "reserve-loans",
    {
      wallet,
      id: cdpId,
      status: statusParam(filters),
      minTx: minTx?.toString(),
      maxTx: maxTx?.toString(),
      sortBy: LOAN_SORT_OPTIONS.some((o) => o.value === filters.sortBy) ? filters.sortBy : "recent",
      sortOrder: filters.sortOrder,
      limit: String(SP_LOAN_ITEMS_PER_PAGE),
      offset: String((page - 1) * SP_LOAN_ITEMS_PER_PAGE),
    },
    { baseUrl: hop.baseUrl, headers: hop.headers, signal: hop.signal },
  );
  return { data: r.rows, total: r.pagination.total };
}
