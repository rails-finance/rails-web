// Ebisu trove listing filter registry (chain-state tier, IN-MEMORY). Ebisu is a small
// set (~91 Troves across 5 branches), so — like Maker / Morpho — the page fetches all
// of them once and filters client-side. Declares the categorical facets (Status and
// its switches, Collateral branch) as ListDimensions over the in-memory row set; sort + search are
// the non-categorical controls. All values are read from the chain (replayed status, raw
// collateral / ebUSD debt, user-set interest rate).
//
// Size is the Debt range in ebUSD and the Collateral range in USD
// (lib/shared/size-dimensions.ts): debt is the row's ebUSD amount, since the
// listing reads no USD price for ebUSD, and collateral is the row's collateralUsd at the branch's last indexed price, so an unpriced
// branch falls out of any Collateral bound (an emptied trove reads $0).
// Transactions is a range over the row's txCount
// (lib/shared/transactions-dimension.ts).

import { matchesFormerHolder } from "@/lib/liquity-fork/former-holders";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { DEBT_SYMBOL } from "@/lib/ebisu/asset-catalog";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { troveStatusDimensions } from "@/lib/liquity-v2/list-filter-dimensions";
import { troveDimensionAdmits, type TroveLifecycle } from "@/lib/liquity-v2/listing-visibility";
import type { ListDimension, BaseListFilters, ApplyConfig } from "@/lib/shared/list-filter";
import type { EbisuTroveSummary } from "@/lib/sources/api/ebisu-troves";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import { rangeAdmits, sizeDimensions } from "@/lib/shared/size-dimensions";
import { transactionsDimension } from "@/lib/shared/transactions-dimension";

export interface EbisuListFilters extends BaseListFilters {
  /** One of open / closed / all, or [] for the resting choice (ui-jobs 805). */
  status: string[];
  /** "" | "dormant" — with Open, the troves below the minimum debt. URL param `open`. */
  dormant: string[];
  /** "" | "liquidated" — with Closed, the troves that ended by liquidation.
   *  URL param `ended`. */
  ended: string[];
  branches: string[];
  /** Debt range in ebUSD, one encodeRange value or [] for no bound. */
  debt: string[];
  /** Collateral range in USD, as `debt`. */
  coll: string[];
  /** Transaction-count range, one encodeRange value or [] for no bound. */
  tx: string[];
}

export const EBISU_LIST_DEFAULTS: EbisuListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  dormant: [],
  ended: [],
  branches: [],
  debt: [],
  coll: [],
  tx: [],
};

/** The Transactions slider's top: the round number above the busiest trove
 *  (209 transactions in the api's own count over all 91 troves, 20 Oct 2026). */
const EBISU_TX_TOP = 250;

/** The Size panel's price line. */
const EBISU_SIZE_NOTE = `Debt in ${DEBT_SYMBOL}; collateral at the branch's last indexed price.`;

export const EBISU_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "collateral", label: "Collateral" },
  { value: "debt", label: "Debt (ebUSD)" },
  { value: "rate", label: "Interest rate" },
];

// Status is Open / Closed / All with the Dormant and Closed by liquidation
// switches (ui-jobs 805; lib/liquity-v2/listing-visibility.ts), applied here over
// the fetched rows. A trove the server marks zombie (`isZombie` on the served
// row) is the one the switch keeps, the predicate the card's pill reads. The web
// does not derive the state from debt: an Ebisu redemption can leave a Trove
// below MIN_DEBT that the chain still reads Active (ui-jobs 420). Ebisu's docs
// call it a zombie position (decision 0065), so the switch reads "Zombie".
const ZOMBIE_LABEL = "Zombie";

const lifecycleOf = (row: EbisuTroveSummary): TroveLifecycle =>
  row.status === "open" && row.isZombie ? "zombie" : row.status;

/** Collateral in USD: $0 once the trove holds none, null while its branch is
 *  unpriced. */
const collUsdOf = (row: EbisuTroveSummary): number | null => (row.collateral > 0 ? row.collateralUsd : 0);

export function ebisuListDimensions(rows: EbisuTroveSummary[]): ListDimension<EbisuListFilters, EbisuTroveSummary>[] {
  const branchSeen = new Map<string, FilterOptionDef>();
  for (const r of rows) {
    if (!branchSeen.has(r.collateralType)) {
      branchSeen.set(r.collateralType, {
        value: r.collateralType,
        label: r.collateralType,
        icon: <TokenChipIcon symbol={r.collateralType} size={16} filterable={false} />,
      });
    }
  }

  return [
    ...troveStatusDimensions<EbisuListFilters>(ZOMBIE_LABEL).map((d) => ({
      ...d,
      matches: (row: EbisuTroveSummary, v: string[]) => troveDimensionAdmits(d.id, v, lifecycleOf(row)),
    })),
    {
      id: "branches",
      label: "Collateral",
      group: "Collateral",
      cardinality: "multi",
      param: "branch",
      options: [...branchSeen.values()],
      get: (f) => f.branches,
      set: (f, v) => ({ ...f, branches: v }),
      matches: (row, v) => v.includes(row.collateralType),
    },
    ...sizeDimensions<EbisuListFilters>({
      getDebt: (f) => f.debt,
      setDebt: (f, debt) => ({ ...f, debt }),
      getColl: (f) => f.coll,
      setColl: (f, coll) => ({ ...f, coll }),
      panelNote: EBISU_SIZE_NOTE,
      debtUnit: DEBT_SYMBOL,
    }).map((d) => ({
      ...d,
      matches: (row: EbisuTroveSummary, v: string[]) => rangeAdmits(v, d.id === "debt" ? row.debt : collUsdOf(row)),
    })),
    {
      ...transactionsDimension<EbisuListFilters>({
        get: (f) => f.tx,
        set: (f, tx) => ({ ...f, tx }),
        top: EBISU_TX_TOP,
      }),
      matches: (row, v) => rangeAdmits(v, row.txCount),
    },
  ];
}

export const EBISU_APPLY: ApplyConfig<EbisuTroveSummary> = {
  // Search matches the trove id, branch, OR the owner (address or ENS) — so the
  // owner pill's `?q=<addr>` deep-link narrows the in-memory set to one wallet's
  // troves. `last_owner` counts too, so a closed trove still answers its owner.
  search: (row, q) =>
    row.id.toLowerCase().includes(q) ||
    row.collateralType.toLowerCase().includes(q) ||
    (row.owner?.toLowerCase().includes(q) ?? false) ||
    (row.lastOwner?.toLowerCase().includes(q) ?? false) ||
    (row.ownerEns?.toLowerCase().includes(q) ?? false) ||
    // A wallet that held the Trove and moved it on (ui-jobs 715).
    matchesFormerHolder(row, q),
  sort: {
    recent: (r) => r.lastActivityAt,
    collateral: (r) => r.collateral,
    debt: (r) => r.debt,
    rate: (r) => r.interestRate,
  },
};
