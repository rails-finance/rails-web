// PWN listing filter registry (chain-state tier). A PWN position is a DISCRETE
// fixed-term loan (one loan_id), so the facets are loan-shaped: Status (open /
// repaid / defaulted, resting on a CONTEXTUAL default — lib/pwn/listing-visibility.ts)
// and the two asset sides (Credit advanced, Collateral locked),
// their option lists derived from the loans actually present. All chain-state — the
// replayed status and the named loan assets. No CR/USD facet: a fixed-term P2P loan
// has no health factor or oracle price. The shared ListToolbar / applyListFilter
// render and run this. Twin patterns in lib/morpho + lib/liquity-v1.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { ListDimension, BaseListFilters, ApplyConfig } from "@/lib/shared/list-filter";
import type { PwnPositionSummary } from "@/lib/sources/api/pwn-positions";
import type { SortOption } from "@/components/shared/filter-bar/sort-control";
import { loanDueAt } from "@/lib/pwn/economics";
import { canonicalStatuses, defaultStatuses, effectiveStatuses, sameStatusSet } from "@/lib/pwn/listing-visibility";

export interface PwnListFilters extends BaseListFilters {
  status: string[];
  credit: string[];
  collateral: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion", and
// listing-visibility.ts resolves it per context — the open loans on the bare directory, every
// status once the search names a loan or a party. Because the default is contextual rather than
// a selection it draws no chip and no Reset link, and a cleared selection resolves back to what
// the context rests on.
export const PWN_LIST_DEFAULTS: PwnListFilters = {
  q: "",
  sortBy: "created",
  sortOrder: "desc",
  status: [],
  credit: [],
  collateral: [],
};

// "Due" and "Settled" are the book page's two orders, offered here so the book can
// link to them rather than re-list the loans it describes: open loans in deadline
// order, and settled loans by the date they closed. Both read fields the row
// already carries — no extra fetch, and nothing derived that the loan didn't fix
// at origination.
export const PWN_SORT_OPTIONS: SortOption[] = [
  { value: "created", label: "Created" },
  { value: "due", label: "Due" },
  { value: "settled", label: "Settled" },
  { value: "events", label: "Events" },
];

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "repaid", label: "Repaid" },
  { value: "defaulted", label: "Defaulted" },
];

/** Distinct option list keyed by `value`, preserving first-seen order. */
function distinct<T>(rows: T[], pick: (r: T) => FilterOptionDef | null): FilterOptionDef[] {
  const seen = new Map<string, FilterOptionDef>();
  for (const r of rows) {
    const o = pick(r);
    if (o && !seen.has(o.value)) seen.set(o.value, o);
  }
  return [...seen.values()];
}

export function pwnListDimensions(rows: PwnPositionSummary[]): ListDimension<PwnListFilters, PwnPositionSummary>[] {
  const assetOption = (a: PwnPositionSummary["credit"]): FilterOptionDef | null =>
    a
      ? {
          value: a.symbol,
          label: a.symbol,
          icon: <TokenChipIcon symbol={a.symbol} address={a.address} size={16} filterable={false} />,
        }
      : null;
  const creditOptions = distinct(rows, (r) => assetOption(r.credit));
  const collateralOptions = distinct(rows, (r) => assetOption(r.collateral));

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
      set: (f, v) => {
        const sel = canonicalStatuses(v);
        return { ...f, status: sel.length === 0 || sameStatusSet(sel, defaultStatuses(f)) ? [] : sel };
      },
      matches: (row, v) => v.includes(row.status),
    },
    {
      id: "credit",
      label: "Credit",
      group: "Asset",
      cardinality: "multi",
      param: "credit",
      options: creditOptions,
      get: (f) => f.credit,
      set: (f, v) => ({ ...f, credit: v }),
      matches: (row, v) => (row.credit ? v.includes(row.credit.symbol) : false),
    },
    {
      id: "collateral",
      label: "Collateral",
      group: "Asset",
      cardinality: "multi",
      param: "coll",
      options: collateralOptions,
      get: (f) => f.collateral,
      set: (f, v) => ({ ...f, collateral: v }),
      matches: (row, v) => (row.collateral ? v.includes(row.collateral.symbol) : false),
    },
  ];
}

export const PWN_APPLY: ApplyConfig<PwnPositionSummary> = {
  search: (row, q) =>
    row.loanId.toLowerCase().includes(q) ||
    (row.lender?.toLowerCase().includes(q) ?? false) ||
    (row.borrower?.toLowerCase().includes(q) ?? false),
  sort: {
    created: (r) => r.createdAt ?? 0,
    // A loan states its deadline as either an absolute expiry or a duration from
    // creation, so the sortable moment is derived — `loanDueAt` is the same
    // function the loan book and the position card resolve it with. A loan whose
    // terms don't resolve to a deadline sorts LAST on ascending (the book's own
    // convention), never to the front as a 0 would put it.
    due: (r) => loanDueAt(r) ?? Number.MAX_SAFE_INTEGER,
    settled: (r) => r.closedAt ?? 0,
    events: (r) => r.eventCount,
  },
};
