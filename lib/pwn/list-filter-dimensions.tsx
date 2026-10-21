// PWN listing filter registry (chain-state tier). A PWN position is a DISCRETE
// fixed-term loan (one loan_id), so the facets are loan-shaped: Status (running /
// defaulted not yet claimed / repaid / defaulted and claimed, resting on a
// CONTEXTUAL default — lib/pwn/listing-visibility.ts)
// and the two asset sides (Credit advanced, Collateral locked),
// their option lists derived from the loans actually present. All chain-state — the
// replayed status and the named loan assets. No CR/USD facet: a fixed-term P2P loan
// has no health factor or oracle price. Size is one Debt range in the loan's
// credit asset (lib/shared/size-dimensions.ts), matched against the credit
// amount scaled by the asset's decimals; a loan whose credit decimals did not
// load has no figure and falls out of any bound. Transactions is a range over the loan's
// distinct transactions (lib/shared/transactions-dimension.ts), matched here
// against `txCount`. The shared ListToolbar / applyListFilter
// render and run this. Twin patterns in lib/morpho + lib/liquity-v1.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { decodeRange, defaultChipLabel, type FilterOptionDef } from "@/components/shared/filter-bar/types";
import { transactionsDimension } from "@/lib/shared/transactions-dimension";
import { rangeAdmits, sizeDimensions } from "@/lib/shared/size-dimensions";
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
  /** Debt range in the credit asset, one encodeRange value or [] for no bound. */
  debt: string[];
  /** Transaction-count range, one encodeRange value or [] for no bound. */
  tx: string[];
}

/** The Transactions slider's top: the round number above the busiest loan
 *  (7 transactions, 20 Oct 2026). */
const PWN_TX_TOP = 10;

/** The Debt slider's top, in credit-asset units: the round number above the
 *  largest loan (49,999 OLAS, 21 Oct 2026). */
const PWN_DEBT_TOP = 50_000;

const PWN_SIZE_NOTE = "Debt in the loan's credit asset.";

/** The credit advanced, in whole units of the credit asset; null for an
 *  asset that is not an ERC-20 or whose decimals did not load. */
function creditFigure(row: PwnPositionSummary): number | null {
  const c = row.credit;
  if (!c || c.category !== "ERC20" || c.decimalsUnread) return null;
  return c.amount;
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
  debt: [],
  tx: [],
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
      clearDefault: (f) => ({ ...f, status: [...ALL_PWN_STATUS_BUCKETS] }),
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
    ...sizeDimensions<PwnListFilters>({
      getDebt: (f) => f.debt,
      setDebt: (f, debt) => ({ ...f, debt }),
      getColl: () => [],
      setColl: (f) => f,
      sides: ["debt"],
      debtUnit: "credit asset",
      top: PWN_DEBT_TOP,
      panelNote: PWN_SIZE_NOTE,
    }).map((d) => ({ ...d, matches: (row: PwnPositionSummary, v: string[]) => rangeAdmits(v, creditFigure(row)) })),
    {
      ...transactionsDimension<PwnListFilters>({
        get: (f) => f.tx,
        set: (f, tx) => ({ ...f, tx }),
        top: PWN_TX_TOP,
      }),
      // `txCount` is null on a row the server has not counted yet. With no bound
      // set this predicate is not asked and the row stays listed; under any
      // bound it falls out, since its count cannot be placed in the range.
      matches: (row, v) => {
        const n = row.txCount;
        if (n == null) return false;
        const { min, max } = decodeRange(v);
        return (min == null || n >= min) && (max == null || n <= max);
      },
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
