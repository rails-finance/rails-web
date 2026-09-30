// PWN listing filter registry (chain-state tier). A PWN position is a DISCRETE
// fixed-term loan (one loan_id), so the facets are loan-shaped: Status (running /
// defaulted not yet claimed / repaid / defaulted and claimed, resting on a
// CONTEXTUAL default — lib/pwn/listing-visibility.ts)
// and the two asset sides (Credit advanced, Collateral locked),
// their option lists derived from the loans actually present. All chain-state — the
// replayed status and the named loan assets. No CR/USD facet: a fixed-term P2P loan
// has no health factor or oracle price. The shared ListToolbar / applyListFilter
// render and run this. Twin patterns in lib/morpho + lib/liquity-v1.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { defaultChipLabel, type FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { ListDimension, BaseListFilters, ApplyConfig } from "@/lib/shared/list-filter";
import type { PwnPositionSummary } from "@/lib/sources/api/pwn-positions";
import type { SortOption } from "@/components/shared/filter-bar/sort-control";
import { loanDeadlineAt, pwnLoanState } from "@/lib/pwn/economics";
import {
  ALL_PWN_STATUS_BUCKETS,
  NO_PWN_STATUS,
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  sameStatusSet,
} from "@/lib/pwn/listing-visibility";

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

// A loan past its deadline has defaulted on chain whether or not the lender has
// claimed yet, so the two default buckets both say "Defaulted".
const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Running" },
  { value: "unclaimed", label: "Defaulted, not yet claimed" },
  { value: "repaid", label: "Repaid" },
  { value: "defaulted", label: "Defaulted and claimed" },
];

/** "0 running" — a bucket's word after a zero count. */
const ZERO_WORD: Record<string, string> = {
  open: "running",
  unclaimed: "unclaimed",
  repaid: "repaid",
  defaulted: "claimed",
};

/** The loan's bucket now (lib/pwn/economics.ts `pwnLoanState`, "running" → "open"). */
export function pwnStatusBucket(row: PwnPositionSummary): string {
  const s = pwnLoanState({ ...row, extendedDueAt: row.latestDefaultAt });
  return s === "running" ? "open" : s;
}

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
  // A bucket with no loan in it says so beside its box ("0 running"), so ticking
  // it and seeing nothing change reads as the answer.
  const bucketCounts = new Map<string, number>();
  for (const r of rows) bucketCounts.set(pwnStatusBucket(r), (bucketCounts.get(pwnStatusBucket(r)) ?? 0) + 1);
  const statusOptions: FilterOptionDef[] = STATUS_OPTIONS.map((o) =>
    rows.length > 0 && !bucketCounts.get(o.value) ? { ...o, meta: `0 ${ZERO_WORD[o.value] ?? ""}`.trim() } : o,
  );
  const collateralOptions = distinct(rows, (r) => assetOption(r.collateral));

  return [
    {
      id: "status",
      label: "Status",
      group: "Status",
      cardinality: "multi",
      param: "status",
      options: statusOptions,
      get: (f) => effectiveStatuses(f),
      defaultValues: (f) => defaultStatuses(f),
      // Each box adds or removes that option: unticking the last one leaves none
      // ticked (and no loans listed); only a selection equal to the default
      // returns to the clean URL.
      set: (f, v) => {
        const sel = canonicalStatuses(v);
        return {
          ...f,
          status: sel.length === 0 ? [NO_PWN_STATUS] : sameStatusSet(sel, defaultStatuses(f)) ? [] : sel,
        };
      },
      chipLabel: (values, options) =>
        values.includes(NO_PWN_STATUS) ? "Status: none ticked" : defaultChipLabel("Status", values, options),
      // The bare directory rests on the loans still in escrow; the chip says so.
      // A search naming a loan or a party rests on every status, which needs no chip.
      defaultChip: (f) => (defaultStatuses(f).length < ALL_PWN_STATUS_BUCKETS.length ? "Status: in escrow" : null),
      matches: (row, v) => v.includes(pwnStatusBucket(row)),
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
    // creation, and an extension moves it, so the sortable moment is derived —
    // `loanDeadlineAt` is the function the loan book and the position card
    // resolve it with. A loan whose
    // terms don't resolve to a deadline sorts LAST on ascending (the book's own
    // convention), never to the front as a 0 would put it.
    due: (r) => loanDeadlineAt({ ...r, extendedDueAt: r.latestDefaultAt }) ?? Number.MAX_SAFE_INTEGER,
    settled: (r) => r.closedAt ?? 0,
    events: (r) => r.eventCount,
  },
};
