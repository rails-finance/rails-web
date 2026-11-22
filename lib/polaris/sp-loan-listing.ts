// The two sub-page listings beside the CDPs: Stability Pool deposits and
// reserve loans. Server-driven, as the CDP listing is: the selection maps
// onto /api/polaris/stability-pool or /api/polaris/reserve-loans params and
// rails-server filters, sorts and pages.
//
// The search box reads what the CDP listing's does (lib/polaris/search.ts): a
// number (a deposit names its market first, "usdp:40"; a bare number reads
// both pools), a holder address, or an ENS name, resolved here first. Status
// is Open / Closed / All (ui-jobs 805, sp-loan-visibility.ts): naming one rests
// it on All. Deposit and Gain sorts appear once a market is
// chosen: the two pools' deposits are different tokens.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { BaseListFilters, SerializableDimension } from "@/lib/shared/list-filter";
import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { resolveEnsViaApi } from "@/lib/shared/listing-search";
import { normalizeMarket, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { parsePolarisSearch } from "@/lib/polaris/search";
import { defaultStatusChoice, statusChoice, statusParam } from "@/lib/polaris/sp-loan-visibility";
import { readStatusParam, STATUS_CHOICE_OPTIONS } from "@/lib/shared/status-choice";
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
  /** One of open / closed / all, or [] for the resting choice (ui-jobs 805). */
  status: string[];
  vault: string[];
  tx: string[];
}

export interface PolarisLoanFilters extends BaseListFilters {
  /** One of open / closed / all, or [] for the resting choice (ui-jobs 805). */
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

function statusDimension<F extends BaseListFilters & { status: string[] }>(): SerializableDimension<F> {
  return {
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
  /** Rows asked for; a page's worth by default (one for a draft's count). */
  limit?: number;
}

/** The holder the search names, as an address: an ENS name resolves first.
 *  `null` is a name that resolves to nothing, and the page is empty. */
async function holderOf(q: string, hop: Hop): Promise<string | undefined | null> {
  const { ownerAddress, ownerEns } = parsePolarisSearch(q);
  if (ownerAddress) return ownerAddress.toLowerCase();
  if (ownerEns) return (await resolveEnsViaApi(ownerEns, hop.baseUrl, hop.signal))?.toLowerCase() ?? null;
  return undefined;
}

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
  const limit = hop.limit ?? SP_LOAN_ITEMS_PER_PAGE;
  const params = {
    wallet,
    status: statusParam(filters),
    vaultHeld: filters.vault[0],
    minTx: minTx?.toString(),
    maxTx: maxTx?.toString(),
    sortBy,
    sortOrder: filters.sortOrder,
    limit: String(limit),
    offset: String((page - 1) * limit),
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
  const limit = hop.limit ?? SP_LOAN_ITEMS_PER_PAGE;
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
      limit: String(limit),
      offset: String((page - 1) * limit),
    },
    { baseUrl: hop.baseUrl, headers: hop.headers, signal: hop.signal },
  );
  return { data: r.rows, total: r.pagination.total };
}
